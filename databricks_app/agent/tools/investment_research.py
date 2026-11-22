import os
from functools import lru_cache

from databricks.sdk import WorkspaceClient
from databricks_langchain import VectorSearchRetrieverTool
from langchain_core.tools import tool


RESEARCH_INDEX = "investment_ai.research.investment_ai_research_index"


@lru_cache(maxsize=1)
def _ai_search_workspace_client() -> WorkspaceClient:
    """
    Local:
      use the investment-ai CLI profile.

    Deployed Databricks App:
      use the app's automatically injected service-principal identity.
    """

    # Deployed Agent Runtime / Databricks App
    if (
        os.getenv("DATABRICKS_CLIENT_ID")
        and os.getenv("DATABRICKS_CLIENT_SECRET")
    ):
        return WorkspaceClient()

    # Local Agent Bricks development
    profile = os.getenv(
        "DATABRICKS_CONFIG_PROFILE",
        "investment-ai",
    )

    wc = WorkspaceClient(profile=profile)

    if wc.config.auth_type in {
        "pat",
        "oauth-m2m",
        "model_serving_user_credentials",
    }:
        return wc

    # Local OAuth CLI profile -> short-lived bearer token
    headers = wc.config.authenticate()
    authorization = headers.get("Authorization", "")

    if not authorization.startswith("Bearer "):
        raise RuntimeError(
            "Unable to obtain Databricks credentials for AI Search."
        )

    token = authorization.removeprefix("Bearer ").strip()

    return WorkspaceClient(
        host=wc.config.host,
        token=token,
        auth_type="pat",
    )


@lru_cache(maxsize=1)
def _research_retriever():
    return VectorSearchRetrieverTool(
        index_name=RESEARCH_INDEX,
        workspace_client=_ai_search_workspace_client(),
        tool_name="investment_research_retriever",
        tool_description=(
            "Search Investment AI research documents for company research, "
            "earnings commentary, management statements, guidance, outlook, "
            "business drivers, catalysts, and risks."
        ),
        num_results=5,
        query_type="HYBRID",
    )


@tool
def search_investment_research(query: str) -> str:
    """
    Search governed Investment AI research documents.

    Use this tool for:
    - company research
    - earnings commentary
    - management guidance
    - outlook
    - investment drivers
    - catalysts
    - company risks

    Do not use it for portfolio holdings, position weights,
    portfolio exposure, or concentration-policy calculations.
    """
    result = _research_retriever().invoke(query)

    if isinstance(result, str):
        return result

    return str(result)