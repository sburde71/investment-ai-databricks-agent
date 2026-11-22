import mlflow
import asyncio
import json
import os
import re
import uuid
from collections.abc import AsyncGenerator, Callable
from functools import lru_cache
from typing import Any

from databricks.sdk import WorkspaceClient
from databricks_langchain import ChatDatabricks
from langchain_core.messages import (
    AIMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.types import Command

from agent.mcps import build_mcp_servers
from agent.tools import all_tools
from databricks_agentkit import workspace_client, workspace_headers
from databricks_agentkit.langgraph import (
    checkpointer,
    configure_tracing,
    mcp_tools,
    start_trace,
    thread_config,
)
from databricks_agentkit.langgraph.session_store import (
    invocation_id_from_metadata,
    invocation_metadata,
)
from databricks_agentkit.runtime.auth import AuthError
from databricks_agentkit.runtime.tool_manifest import resolve_model_service

MODEL = resolve_model_service() or "investment_ai.gateway.investment_ai_runtime"
DEFAULT_CONCENTRATION_THRESHOLD = 0.10

# Genie polling defaults.
# These can be overridden without code changes if the environment needs tuning.
GENIE_POLL_INTERVAL_SECONDS = float(os.getenv("GENIE_POLL_INTERVAL_SECONDS", "2"))
GENIE_POLL_TIMEOUT_SECONDS = int(os.getenv("GENIE_POLL_TIMEOUT_SECONDS", "120"))
GENIE_POLL_ATTEMPTS = max(
    1,
    int(GENIE_POLL_TIMEOUT_SECONDS / GENIE_POLL_INTERVAL_SECONDS),
)


class InvestmentState(MessagesState):
    route: str
    question: str
    portfolio_evidence: str
    portfolio_id: str
    largest_holding: str
    security_id: str
    as_of_date: str
    risk_evidence: str
    research_evidence: str


class _RoutedChatDatabricks(ChatDatabricks):
    def _get_client_kwargs(self) -> dict[str, Any]:
        kwargs = super()._get_client_kwargs()
        if headers := workspace_headers():
            kwargs["default_headers"] = headers
        return kwargs


@lru_cache(maxsize=1)
def _app_workspace_client() -> WorkspaceClient:
    return workspace_client()


def configure() -> None:
    _check_databricks_auth()
    configure_tracing()

    # Explicit LangGraph / LangChain MLflow instrumentation.
    # Required so node, model, and tool spans are persisted for evaluation.
    mlflow.langchain.autolog()


def _check_databricks_auth() -> None:
    try:
        _app_workspace_client()
    except Exception as e:
        profile = os.getenv("DATABRICKS_CONFIG_PROFILE")
        target = f"profile {profile!r}" if profile else "DEFAULT profile / DATABRICKS_HOST+TOKEN"
        raise RuntimeError(
            f"Databricks auth is not configured. Tried {target}. "
            "Run `databricks auth login --profile <name>`."
        ) from e


def _model(endpoint: str) -> _RoutedChatDatabricks:
    return _RoutedChatDatabricks(
        endpoint=endpoint,
        workspace_client=_app_workspace_client(),
        use_ai_gateway=True,
        use_responses_api=True,
        temperature=None,
    )


def _content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                text = block.get("text") or block.get("output_text") or block.get("content")
                if isinstance(text, str):
                    parts.append(text)
            else:
                text = getattr(block, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return str(content)


def _latest_user_question(messages: list[Any]) -> str:
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return _content_to_text(message.content)
        if isinstance(message, dict) and message.get("role") == "user":
            return _content_to_text(message.get("content"))
    return ""


def _tool_payload_text(result: Any) -> str:
    """Unwrap MCP/LangChain content blocks into their actual text payload."""
    if result is None:
        return ""

    if isinstance(result, str):
        return result

    if isinstance(result, list):
        parts: list[str] = []
        for item in result:
            text = _tool_payload_text(item)
            if text:
                parts.append(text)
        return "\n".join(parts)

    if isinstance(result, dict):
        # Common MCP content-block shape: {"type": "text", "text": "..."}
        if isinstance(result.get("text"), str):
            return result["text"]

        # Some wrappers return a content array.
        if "content" in result:
            content_text = _tool_payload_text(result["content"])
            if content_text:
                return content_text

        # If this is already the structured payload we want, preserve it as JSON.
        try:
            return json.dumps(result, default=str)
        except Exception:
            return str(result)

    text = getattr(result, "text", None)
    if isinstance(text, str):
        return text

    content = getattr(result, "content", None)
    if content is not None:
        content_text = _tool_payload_text(content)
        if content_text:
            return content_text

    return str(result)


def _safe_result_text(result: Any) -> str:
    return _tool_payload_text(result)


def _tool_map(tools: list[Any]) -> dict[str, Any]:
    return {tool.name: tool for tool in tools if getattr(tool, "name", None)}


def _find_tool(tools_by_name: dict[str, Any], exact: str | None = None, suffix: str | None = None):
    if exact and exact in tools_by_name:
        return tools_by_name[exact]
    if suffix:
        for name, tool in tools_by_name.items():
            if name.endswith(suffix):
                return tool
    available = ", ".join(sorted(tools_by_name))
    wanted = exact or f"*{suffix}"
    raise RuntimeError(f"Required tool {wanted!r} was not found. Available tools: {available}")


async def _invoke_tool_with_events(tool: Any, args: dict[str, Any]):
    call_id = f"call_{uuid.uuid4().hex}"
    request_message = AIMessage(
        content="",
        tool_calls=[{
            "name": tool.name,
            "args": args,
            "id": call_id,
            "type": "tool_call",
        }],
    )
    result = await tool.ainvoke(args)
    result_text = _safe_result_text(result)
    result_message = ToolMessage(
        content=result_text,
        tool_call_id=call_id,
        name=tool.name,
    )
    return result, [request_message, result_message]


def _json_from_result(result: Any) -> dict[str, Any]:
    """Extract structured JSON even when MCP wraps it in text content blocks."""
    if isinstance(result, dict) and ("response_id" in result or "conversation_id" in result):
        return result

    text = _tool_payload_text(result).strip()

    # First try the complete unwrapped text.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
        if isinstance(parsed, list):
            for item in parsed:
                nested = _json_from_result(item)
                if nested:
                    return nested
        if isinstance(parsed, str):
            return _json_from_result(parsed)
    except Exception:
        pass

    # Fallback: locate an embedded JSON object.
    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

    return {}


def _extract_label(text: str, label: str) -> str:
    pattern = rf"(?im)^\s*[-*]?\s*\**{re.escape(label)}\**\s*:\s*\**([^\n*]+)"
    match = re.search(pattern, text)
    return match.group(1).strip() if match else ""


def _extract_portfolio_id(text: str) -> str:
    value = _extract_label(text, "PORTFOLIO_ID")
    if value:
        return value
    match = re.search(r"\bIA-FUND-[A-Za-z0-9_-]+\b", text)
    return match.group(0) if match else ""


def _extract_as_of_date(text: str) -> str:
    value = _extract_label(text, "AS_OF_DATE")
    if value:
        match = re.search(r"\d{4}-\d{2}-\d{2}", value)
        if match:
            return match.group(0)
    match = re.search(r"\b20\d{2}-\d{2}-\d{2}\b", text)
    return match.group(0) if match else ""


def _extract_largest_holding(text: str) -> str:
    value = _extract_label(text, "LARGEST_HOLDING")
    if value:
        return value
    match = re.search(r"\bSynthetic\s+[A-Za-z ]+Company\s+\d+\b", text, flags=re.IGNORECASE)
    return match.group(0) if match else ""


def _extract_security_id(text: str) -> str:
    value = _extract_label(text, "SECURITY_ID")
    if value:
        return value
    match = re.search(r"\bIA-SYN-\d+\b", text)
    return match.group(0) if match else ""


def _genie_completed(text: str) -> bool:
    lower = text.lower()
    return (
        '"status":"completed"' in lower
        or '"status": "completed"' in lower
        or "**status:** completed" in lower
        or "status: completed" in lower
        or "genie has finished" in lower
    )


def _genie_failed(text: str) -> bool:
    lower = text.lower()
    return (
        '"status":"failed"' in lower
        or '"status": "failed"' in lower
        or "status: failed" in lower
    )


async def create_agent_graph(
    actor: str,
    model: str | None = None,
    *,
    workspace_client_for: Callable[[str], WorkspaceClient] | None = None,
):
    endpoint = model or MODEL
    llm = _model(endpoint)

    mcp = await mcp_tools(
        build_mcp_servers(),
        workspace_client_for=workspace_client_for,
    )

    tools = [*all_tools(), *mcp]
    tools_by_name = _tool_map(tools)

    genie_ask = _find_tool(tools_by_name, exact="genie_ask")
    genie_poll = _find_tool(tools_by_name, exact="genie_poll_response")
    research_tool = _find_tool(tools_by_name, exact="search_investment_research")
    risk_tool = _find_tool(tools_by_name, suffix="check_portfolio_concentration")

    def _classify_route(question: str) -> str:
        """
        Deterministic routing avoids spending a model call on classification and
        prevents the jailbreak service policy from evaluating an internal router prompt.
        """
        q = question.lower()

        portfolio_terms = [
            "portfolio",
            "fund",
            "holding",
            "holdings",
            "largest holding",
            "position weight",
            "market value",
            "exposure",
            "sector",
        ]
        risk_terms = [
            "concentration",
            "breach",
            "policy",
            "threshold",
            "limit",
            "breach our",
            "breaches",
        ]
        research_terms = [
            "research",
            "latest research",
            "outlook",
            "earnings",
            "guidance",
            "key drivers",
            "business drivers",
            "catalyst",
            "catalysts",
            "investment thesis",
            "company risks",
            "major risks",
        ]

        has_portfolio = any(term in q for term in portfolio_terms)
        has_risk = any(term in q for term in risk_terms)
        has_research = any(term in q for term in research_terms)

        if has_research and has_risk:
            return "mixed"
        if has_portfolio and has_research:
            return "portfolio_research"
        if has_risk:
            return "risk"
        if has_research:
            return "research"
        return "portfolio"

    async def route_node(state: InvestmentState):
        question = _latest_user_question(state["messages"])

        # Start every user turn with fresh domain evidence.
        # Conversation messages remain durable, but specialist evidence from a
        # previous turn must never leak into the next answer.
        return {
            "question": question,
            "route": _classify_route(question),
            "portfolio_evidence": "",
            "portfolio_id": "",
            "largest_holding": "",
            "security_id": "",
            "as_of_date": "",
            "risk_evidence": "",
            "research_evidence": "",
        }

    async def portfolio_node(state: InvestmentState):
        genie_question = f"""
Use governed Databricks business context to resolve the portfolio portion of this request:

{state["question"]}

You MUST resolve the actual portfolio_id before finishing.

Return:
- portfolio_id
- portfolio_name
- largest holding company name
- security_id
- position_weight
- market_value
- as_of_date

If no date is specified, use the latest available portfolio snapshot.

At the END include these exact plain-text lines:

PORTFOLIO_ID: <actual portfolio id>
LARGEST_HOLDING: <company name>
SECURITY_ID: <security id>
POSITION_WEIGHT: <decimal or percent>
MARKET_VALUE: <market value>
AS_OF_DATE: <YYYY-MM-DD>
""".strip()

        ask_result, _ = await _invoke_tool_with_events(
            genie_ask,
            {"question": genie_question},
        )

        ask_data = _json_from_result(ask_result)
        conversation_id = ask_data.get("conversation_id")
        response_id = ask_data.get("response_id")

        if not conversation_id or not response_id:
            raise RuntimeError(
                "Genie did not return conversation_id/response_id. "
                f"Raw result: {_safe_result_text(ask_result)}"
            )

        final_text = _tool_payload_text(ask_result)

        for _ in range(GENIE_POLL_ATTEMPTS):
            if _genie_completed(final_text):
                break
            if _genie_failed(final_text):
                raise RuntimeError(f"Genie failed: {final_text}")

            await asyncio.sleep(GENIE_POLL_INTERVAL_SECONDS)

            poll_result, _ = await _invoke_tool_with_events(
                genie_poll,
                {
                    "conversation_id": conversation_id,
                    "response_id": response_id,
                },
            )
            final_text = _tool_payload_text(poll_result)
        else:
            raise TimeoutError(
                f"Genie did not finish within the "
                f"{GENIE_POLL_TIMEOUT_SECONDS}-second polling window. "
                f"Last Genie response: {final_text[:500]}"
            )

        portfolio_id = _extract_portfolio_id(final_text)
        largest_holding = _extract_largest_holding(final_text)
        security_id = _extract_security_id(final_text)
        as_of_date = _extract_as_of_date(final_text)

        if not portfolio_id:
            raise RuntimeError(
                "Genie completed but the workflow could not resolve portfolio_id. "
                "The risk step is blocked rather than guessing."
            )

        if not as_of_date:
            raise RuntimeError(
                "Genie completed but the workflow could not resolve as_of_date."
            )

        return {
            "portfolio_evidence": final_text,
            "portfolio_id": portfolio_id,
            "largest_holding": largest_holding,
            "security_id": security_id,
            "as_of_date": as_of_date,
        }

    async def risk_node(state: InvestmentState):
        portfolio_id = state.get("portfolio_id", "")
        as_of_date = state.get("as_of_date", "")

        if not portfolio_id or not as_of_date:
            raise RuntimeError(
                "Risk evaluation requires a resolved portfolio_id and as_of_date."
            )

        args = {
            "p_portfolio_id": portfolio_id,
            "p_as_of_date": as_of_date,
            "p_threshold": DEFAULT_CONCENTRATION_THRESHOLD,
        }

        risk_result, _ = await _invoke_tool_with_events(risk_tool, args)
        risk_text = _safe_result_text(risk_result)

        if '"rows":[]' in risk_text.replace(" ", ""):
            raise RuntimeError(
                "The governed concentration function returned zero rows for "
                f"{portfolio_id} on {as_of_date}. "
                "The workflow will not invent a BREACH/OK result."
            )

        return {"risk_evidence": risk_text}

    async def research_node(state: InvestmentState):
        company = state.get("largest_holding", "").strip()
        query = (
            f"{company} latest research outlook earnings guidance "
            "key drivers catalysts major risks investment thesis"
            if company
            else state["question"]
        )

        research_result, _ = await _invoke_tool_with_events(
            research_tool,
            {"query": query},
        )

        return {
            "research_evidence": _safe_result_text(research_result),
        }

    async def synthesis_node(state: InvestmentState):
        route = state.get("route", "")

        synthesis_prompt = f"""
You are Investment AI, preparing an executive decision-support answer.

Use ONLY the supplied evidence.
Answer the user's exact question FIRST. Supporting detail comes after the direct answer.

ROUTE:
{route}

PORTFOLIO EVIDENCE:
{state.get("portfolio_evidence", "") or "Not requested"}

RISK EVIDENCE:
{state.get("risk_evidence", "") or "Not requested"}

RESEARCH EVIDENCE:
{state.get("research_evidence", "") or "Not requested"}

MANDATORY RESPONSE RULES:

1. Start with a direct answer. Do not start with background.

2. For a RESEARCH request:
   - Begin with:
     "Research outlook: <one concise sentence>"
   - Then provide at most:
     - Guidance / earnings
     - Key drivers
     - Main risks
     - What to watch
   - Keep the entire answer concise.

3. For a RISK request:
   - Explicitly state:
     "Concentration policy: BREACH"
     or
     "Concentration policy: OK"
     only when supported by the governed risk evidence.
   - Include the holding weight and threshold when available.

4. For a PORTFOLIO request:
   - Directly identify the requested holding or portfolio fact first.
   - Include the relevant weight, market value, and as-of date when available.

5. For a MIXED or PORTFOLIO_RESEARCH request:
   Start with a concise Investment View that explicitly states:
   - largest holding
   - position weight
   - concentration status
   - research outlook
   - why these facts matter together

   Then use only these sections:

   ## Portfolio Impact
   ## Risk Assessment
   ## Research Outlook
   ## PM Takeaway

6. If BREACH appears in the governed risk evidence, explicitly use the word BREACH.

7. Do not bury the answer inside long analysis.

8. Do not repeat evidence unnecessarily.

9. Do not invent facts.

10. Target length:
    - single-domain: 150-250 words maximum
    - mixed request: 300-450 words maximum
""".strip()

        response = await llm.ainvoke(
            [
                SystemMessage(content=synthesis_prompt),
                HumanMessage(content=state["question"]),
            ]
        )
        return {"messages": [response]}

    def route_after_router(state: InvestmentState):
        return state["route"]

    def route_after_portfolio(state: InvestmentState):
        if state["route"] == "portfolio":
            return "synthesize"
        if state["route"] == "portfolio_research":
            return "research"
        return "risk"

    def route_after_risk(state: InvestmentState):
        return "research" if state["route"] == "mixed" else "synthesize"

    graph = StateGraph(InvestmentState)

    graph.add_node("route", route_node)
    graph.add_node("portfolio", portfolio_node)
    graph.add_node("risk", risk_node)
    graph.add_node("research", research_node)
    graph.add_node("synthesize", synthesis_node)

    graph.add_edge(START, "route")

    graph.add_conditional_edges(
        "route",
        route_after_router,
        {
            "portfolio": "portfolio",
            "research": "research",
            "risk": "portfolio",
            "portfolio_research": "portfolio",
            "mixed": "portfolio",
        },
    )

    graph.add_conditional_edges(
        "portfolio",
        route_after_portfolio,
        {
            "synthesize": "synthesize",
            "research": "research",
            "risk": "risk",
        },
    )

    graph.add_conditional_edges(
        "risk",
        route_after_risk,
        {
            "research": "research",
            "synthesize": "synthesize",
        },
    )

    graph.add_edge("research", "synthesize")
    graph.add_edge("synthesize", END)

    return graph.compile(checkpointer=checkpointer())


async def recovery_input(
    agent_input: Any,
    *,
    session_id: str,
    actor: str,
    invocation_id: str,
) -> Any:
    checkpoint = await checkpointer().aget_tuple(thread_config(session_id, actor))
    current_invocation_checkpointed = bool(
        checkpoint and invocation_id_from_metadata(checkpoint.metadata) == invocation_id
    )
    return None if current_invocation_checkpointed else agent_input


async def _validate_approval_resume(
    graph: Any,
    config: dict,
    agent_input: Any,
) -> None:
    if not isinstance(agent_input, Command) or agent_input.resume is None:
        return

    state = await graph.aget_state(config)
    pending = [item for task in state.tasks for item in task.interrupts]

    if not pending:
        return

    if agent_input.resume is None:
        raise AuthError(
            "INVALID_APPROVAL",
            "Invalid approval decision payload.",
            400,
        )


async def run_agent(
    agent_input: Any,
    *,
    session_id: str,
    actor: str | None = None,
    model: str | None = None,
    invocation_id: str | None = None,
    workspace_client_for: Callable[[str], WorkspaceClient] | None = None,
    graph: Any = None,
) -> AsyncGenerator[Any, None]:
    actor = actor or session_id

    if graph is None:
        graph = await create_agent_graph(
            actor,
            model,
            workspace_client_for=workspace_client_for,
        )

    config = thread_config(session_id, actor)

    if invocation_id:
        config["metadata"] = invocation_metadata(invocation_id)

    await _validate_approval_resume(graph, config, agent_input)

    last_update: Any = None

    with start_trace(
        name="invoke",
        inputs=agent_input,
        session_id=session_id,
    ) as span:
        async for event in graph.astream(
            input=agent_input,
            config=config,
            stream_mode=["updates", "messages"],
            durability="sync",
        ):
            mode, payload = event

            if mode == "updates":
                last_update = payload

                # Keep update events flowing for runtime visibility, tracing,
                # Agent Activity, and workflow monitoring.
                yield event
                continue

            if mode == "messages":
                # LangGraph messages mode returns:
                # (message_chunk, metadata)
                try:
                    _, metadata = payload
                except (TypeError, ValueError):
                    continue

                node_name = (
                    metadata.get("langgraph_node")
                    if isinstance(metadata, dict)
                    else None
                )

                # Only the synthesis node is user-facing.
                # Portfolio / Risk / Research execution stays internal
                # and remains visible through runtime activity / tracing.
                if node_name != "synthesize":
                    continue

                yield event

        if span is not None and last_update is not None:
            span.set_outputs(last_update)