const elements = {
  approvalPanel: document.querySelector("#approval-panel"),
  approvalSummary: document.querySelector("#approval-summary"),
  approveAction: document.querySelector("#approve-action"),
  chatLog: document.querySelector("#chat-log"),
  clearEvents: document.querySelector("#clear-events"),
  composer: document.querySelector("#composer"),
  copySession: document.querySelector("#copy-session"),
  emptyState: document.querySelector("#empty-state"),
  eventLog: document.querySelector("#event-log"),
  memoryMode: document.querySelector("#memory-mode-value"),
  memoryStatus: document.querySelector("#memory-status"),
  toolsMode: document.querySelector("#tools-mode-value"),
  toolsStatus: document.querySelector("#tools-status"),
  tracingMode: document.querySelector("#tracing-mode-value"),
  tracingStatus: document.querySelector("#tracing-status"),
  modelSelect: document.querySelector("#model-select"),
  newSession: document.querySelector("#new-session"),
  promptInput: document.querySelector("#prompt-input"),
  refreshConfig: document.querySelector("#refresh-config"),
  refreshSession: document.querySelector("#refresh-session"),
  rejectAction: document.querySelector("#reject-action"),
  rejectSession: document.querySelector("#reject-session"),
  resumeSession: document.querySelector("#resume-session"),
  runStatus: document.querySelector("#run-status"),
  sendButton: document.querySelector("#send-button"),
  sessionId: document.querySelector("#session-id"),
  sessionItems: document.querySelector("#session-items"),
  sessionList: document.querySelector("#session-list"),
  sessionMode: document.querySelector("#session-mode-value"),
  sessionStatus: document.querySelector("#session-status"),
  sessionStoreLabel: document.querySelector("#session-store-label"),
  viewerValue: document.querySelector("#viewer-value"),
  viewerAvatar: document.querySelector("#viewer-avatar"),
  brandSub: document.querySelector("#brand-sub"),
  sessionSearch: document.querySelector("#session-search-input"),
  eventFilters: document.querySelector("#event-filters"),
  eventDetail: document.querySelector("#event-detail"),
  eventDetailJson: document.querySelector("#event-detail-json"),
  copyEventDetail: document.querySelector("#copy-event-detail"),
  eventViewLogs: document.querySelector("#event-view-logs"),
  eventViewList: document.querySelector("#event-view-list"),
  leftCard: document.querySelector(".left-card"),
  capabilitiesBlock: document.querySelector("#capabilities-block"),
  memoryPane: document.querySelector("#memory-pane"),
  memoryBack: document.querySelector("#memory-back"),
  memoryRefresh: document.querySelector("#memory-refresh"),
  memoryStoreName: document.querySelector("#memory-store-name"),
  memoryStoreResource: document.querySelector("#memory-store-resource"),
  memoryActor: document.querySelector("#memory-actor-input"),
  memorySearch: document.querySelector("#memory-search-input"),
  memoryCount: document.querySelector("#memory-count"),
  memoryEntries: document.querySelector("#memory-entries"),
  memoryModal: document.querySelector("#memory-modal"),
  memoryModalTitle: document.querySelector("#memory-modal-title"),
  memoryModalBody: document.querySelector("#memory-modal-body"),
  memoryModalFoot: document.querySelector("#memory-modal-foot"),
  memoryModalClose: document.querySelector("#memory-modal-close"),
  toolsPane: document.querySelector("#tools-pane"),
  toolsBack: document.querySelector("#tools-back"),
  toolsRefresh: document.querySelector("#tools-refresh"),
  toolsBody: document.querySelector("#tools-body"),
};

// The framework label shown in the header subtitle, next to the host.
const AGENT_FRAMEWORK = "LangGraph";

const SESSION_STORAGE_KEY = "databricks-agentbricks-session-id";

function newSessionId() {
  return crypto.randomUUID();
}

const state = {
  busy: false,
  config: null,
  draft: null,
  draftText: "",
  events: [],
  eventSeq: 0,
  eventView: "logs",
  eventFilter: "all",
  selectedEventId: null,
  sessionFilter: "",
  sessions: [],
  instanceId: null,
  lastAssistantText: "",
  managedSessionId: "",
  model: "",
  mode: "streaming",
  pendingInterrupt: null,
  sessionId: localStorage.getItem(SESSION_STORAGE_KEY) || newSessionId(),
};

function ensureSessionId() {
  if (!state.sessionId) throw new Error("The routing session is not initialized yet.");
  return state.sessionId;
}

function setSessionId(value) {
  const nextSessionId = String(value || "");
  if (!nextSessionId) return;
  if (state.sessionId !== nextSessionId) state.managedSessionId = "";
  state.sessionId = nextSessionId;
  localStorage.setItem(SESSION_STORAGE_KEY, state.sessionId);
  elements.sessionId.textContent = state.sessionId;
}

setSessionId(state.sessionId);

function demoUrl(path) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("session_id", ensureSessionId());
  return `${url.pathname}${url.search}`;
}

function setStatus(label, type = "ready") {
  elements.runStatus.textContent = label;
  elements.runStatus.className = `run-status ${type === "ready" ? "" : type}`.trim();
}

// The send button is enabled only when there is text to send and no run is in flight.
function updateSendState() {
  elements.sendButton.disabled = state.busy || !elements.promptInput.value.trim();
}

function setBusy(busy, label = "Working") {
  state.busy = busy;
  elements.chatLog.setAttribute("aria-busy", String(busy));
  updateSendState();
  elements.promptInput.disabled = busy;
  elements.approveAction.disabled = busy;
  elements.rejectAction.disabled = busy;
  elements.newSession.disabled = busy;
  elements.modelSelect.disabled = busy || elements.modelSelect.options.length <= 1;
  elements.refreshSession.disabled = busy || !state.config?.session.history;
  elements.resumeSession.disabled = busy || !state.config?.session.durable;
  elements.rejectSession.disabled = busy || !state.config?.session.durable;
  document.querySelectorAll(".session-open-button").forEach((button) => {
    button.disabled = busy;
  });
  if (busy) setStatus(label, "busy");
  else if (!elements.runStatus.classList.contains("error")) setStatus("Ready");
}

// Human-readable name for each orb color, shown in the expanded capability detail.
const CAPABILITY_SUMMARY = { enabled: "Available", degraded: "Limited", disabled: "Unavailable" };

// Populate a capability's status orb and its click-to-expand detail panel.
// `link` (optional) renders an external link in the detail, e.g. to an MLflow experiment.
function setCapability(element, state, detail, command, link) {
  const key = state === true ? "enabled" : state === "degraded" ? "degraded" : "disabled";
  element.classList.toggle("enabled", key === "enabled");
  element.classList.toggle("degraded", key === "degraded");
  element.classList.toggle("disabled", key === "disabled");
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `Status: ${CAPABILITY_SUMMARY[key]}`);
  const item = element.closest(".capability-item");
  const panel = item?.querySelector(".capability-detail");
  if (!panel) return;

  panel.className = `capability-detail ${key}`;
  panel.hidden = !item.classList.contains("expanded");
  panel.replaceChildren();

  const status = document.createElement("span");
  status.className = "cap-status";
  status.textContent = CAPABILITY_SUMMARY[key];
  panel.append(status);

  if (detail) {
    const description = document.createElement("span");
    description.textContent = detail;
    panel.append(description);
  }
  if (command) {
    const label = document.createElement("span");
    label.className = "cap-command-label";
    label.textContent = "Connect by running:";
    panel.append(label, commandRow(command));
  }
  if (link) {
    const anchor = document.createElement("a");
    anchor.className = "cap-link";
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.append(
      iconSvg(
        "icon",
        '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
      ),
    );
    const label = document.createElement("span");
    label.textContent = link.label;
    anchor.append(label);
    panel.append(anchor);
  }
}

// A CLI command with a copy button, used by capability details and the Tools pane.
function commandRow(command) {
  const row = document.createElement("div");
  row.className = "cap-command";
  const code = document.createElement("code");
  code.textContent = command;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.setAttribute("aria-label", `Copy command: ${command}`);
  copy.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  copy.addEventListener("click", (event) => {
    event.stopPropagation();
    void navigator.clipboard.writeText(command).catch(() => {});
  });
  row.append(code, copy);
  return row;
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Basic JSON syntax highlighting: wraps tokens in <span> classes for coloring.
// The payload is HTML-escaped first, so runtime data can't inject markup.
function highlightJson(value) {
  const json = escapeHtml(formatJson(value));
  return json.replace(
    /("(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "json-num";
      if (match.startsWith("&quot;") || match.startsWith('"')) {
        cls = /:\s*$/.test(match) ? "json-key" : "json-str";
      } else if (match === "true" || match === "false") {
        cls = "json-bool";
      } else if (match === "null") {
        cls = "json-null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

// Bucket an event type into one of the filter categories used by the list view.
function eventCategory(type) {
  const value = String(type || "").toLowerCase();
  if (value === "error" || value.endsWith(".error")) return "error";
  if (value.startsWith("session")) return "sessions";
  if (value.startsWith("memory")) return "memory";
  if (
    value.startsWith("background") ||
    value.startsWith("model") ||
    value.startsWith("run") ||
    ["response", "delta", "message", "interrupt", "runtime.config"].includes(value)
  ) {
    return "invocation";
  }
  return "system";
}

// A short one-line summary for the list view, derived from the payload.
function eventSummary(type, payload) {
  if (payload && typeof payload === "object") {
    for (const key of ["message", "summary", "detail", "status", "error"]) {
      if (typeof payload[key] === "string" && payload[key]) return payload[key];
    }
  }
  return String(type || "event");
}

function eventRunId(payload) {
  if (payload && typeof payload === "object") {
    return payload.run_id || payload.runId || payload.id || payload.invocation_id || "";
  }
  return "";
}

function addEvent(type, payload) {
  state.events.unshift({
    id: `evt-${(state.eventSeq += 1)}`,
    type,
    category: eventCategory(type),
    summary: eventSummary(type, payload),
    runId: eventRunId(payload),
    payload,
    at: new Date(),
  });
  state.events = state.events.slice(0, 80);
  renderEvents();
}

function eventEmpty() {
  const wrap = document.createElement("div");
  wrap.className = "event-empty";
  wrap.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>' +
    "<strong>No events in this session</strong>" +
    "<span>Start an agent run to collect runtime evidence.</span>";
  return wrap;
}

function renderEventDetail() {
  const event = state.events.find((item) => item.id === state.selectedEventId);
  const show = state.eventView === "list" && Boolean(event);
  elements.eventDetail.hidden = !show;
  if (show) elements.eventDetailJson.innerHTML = highlightJson(event.payload);
}

function renderEvents() {
  const listView = state.eventView === "list";
  elements.eventFilters.hidden = !listView;
  elements.eventLog.classList.toggle("list-view", listView);
  elements.eventLog.classList.toggle("logs-view", !listView);
  elements.eventLog.replaceChildren();

  const events = listView
    ? state.events.filter((event) => state.eventFilter === "all" || event.category === state.eventFilter)
    : state.events;

  if (!events.length) {
    elements.eventLog.append(eventEmpty());
    renderEventDetail();
    return;
  }

  if (!listView) {
    for (const event of events) {
      const entry = document.createElement("div");
      entry.className = "event-entry";
      const header = document.createElement("div");
      header.className = "event-entry-header";
      const name = document.createElement("span");
      name.className = `event-type cat-${event.category}`;
      name.textContent = event.type;
      const time = document.createElement("span");
      time.className = "event-time";
      time.textContent = event.at.toLocaleTimeString();
      const body = document.createElement("pre");
      body.innerHTML = highlightJson(event.payload);
      header.append(name, time);
      entry.append(header, body);
      elements.eventLog.append(entry);
    }
    renderEventDetail();
    return;
  }

  for (const event of events) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `event-row${event.id === state.selectedEventId ? " selected" : ""}`;
    const top = document.createElement("div");
    top.className = "event-row-top";
    const type = document.createElement("span");
    type.className = `event-row-type cat-${event.category}`;
    type.textContent = event.type;
    const time = document.createElement("span");
    time.className = "event-row-time";
    time.textContent = event.at.toLocaleTimeString();
    top.append(type, time);
    const summary = document.createElement("div");
    summary.className = "event-row-summary";
    summary.textContent = event.summary;
    row.append(top, summary);
    if (event.runId) {
      const run = document.createElement("div");
      run.className = "event-row-run";
      run.textContent = event.runId;
      row.append(run);
    }
    row.addEventListener("click", () => {
      state.selectedEventId = event.id;
      renderEvents();
    });
    elements.eventLog.append(row);
  }
  renderEventDetail();
}

function setEventView(view) {
  state.eventView = view;
  elements.eventViewLogs.classList.toggle("active", view === "logs");
  elements.eventViewLogs.setAttribute("aria-pressed", String(view === "logs"));
  elements.eventViewList.classList.toggle("active", view === "list");
  elements.eventViewList.setAttribute("aria-pressed", String(view === "list"));
  renderEvents();
}

function normalizeRole(message) {
  const value = String(message?.role || message?.type || "assistant").toLowerCase();
  if (["human", "user"].includes(value)) return "user";
  if (["tool", "function"].includes(value)) return "tool";
  if (["system", "developer"].includes(value)) return "system";
  return "assistant";
}

function extractText(content) {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (content?.type) return extractText([content]);
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        // Reasoning is displayed separately; metadata never belongs in the answer.
        if (!["text", "input_text", "output_text", "refusal"].includes(part?.type)) return "";
        if (typeof part.text === "string") return part.text;
        if (typeof part.refusal === "string") return part.refusal;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return typeof content === "object" ? formatJson(content) : String(content);
}

function extractReasoning(content) {
  return (Array.isArray(content) ? content : [content])
    .filter((part) => ["reasoning", "thinking"].includes(part?.type))
    .map((part) => {
      // Read only public text fields, never signature/encrypted_content or extras.
      const text = part.reasoning ?? part.thinking ?? part.text;
      if (typeof text === "string") return text;
      const parts = part.summary?.length ? part.summary : part.content;
      return (Array.isArray(parts) ? parts : [])
        .filter((item) => ["summary_text", "reasoning_text", "text"].includes(item?.type))
        .map((item) => typeof item.text === "string" ? item.text : "").join("\n");
    }).filter(Boolean).join("\n");
}

function renderReasoning(answer, reasoning, append = false) {
  if (!reasoning) return;
  let details = answer.parentElement.querySelector(".message-reasoning");
  if (!details) {
    details = document.createElement("details");
    details.className = "message-reasoning";
    details.innerHTML = '<summary>Reasoning</summary><div class="message-content"></div>';
    answer.before(details);
  }
  const body = details.lastElementChild;
  renderMessageText(body, (append ? body.dataset.source || "" : "") + reasoning);
}

function hideEmptyState() {
  elements.emptyState.hidden = true;
}

function initials(name) {
  const parts = String(name || "")
    .replace(/@.*/, "")
    .split(/[.\s_-]+/)
    .filter(Boolean);
  if (!parts.length) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function setViewer(name) {
  const label = name || "Local developer";
  elements.viewerValue.textContent = label;
  if (elements.viewerAvatar) elements.viewerAvatar.textContent = initials(label);
}

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function messageName(role, label) {
  if (label) return label;
  if (role === "tool") return "Tool";
  if (role === "system") return "System";
  if (role === "error") return "Error";
  return "Agent";
}

// Hover actions under an agent message. "View trace" is intentionally omitted
// until the demo backend exposes a trace URL (per design feedback).
function buildMessageActions(textEl) {
  const actions = document.createElement("div");
  actions.className = "message-actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "message-action";
  copy.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>';
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textEl.dataset.source ?? textEl.textContent ?? "");
    } catch {
      /* clipboard may be unavailable */
    }
    const span = copy.querySelector("span");
    if (span) {
      span.textContent = "Copied";
      setTimeout(() => {
        span.textContent = "Copy";
      }, 1200);
    }
  });
  actions.append(copy);
  return actions;
}

const markdown = window.markdownit({ html: false }).disable("image");

function renderMessageText(element, content) {
  element.dataset.source = content;
  element.innerHTML = markdown.render(content);
}

function appendMessage(role, content, label, { time } = {}) {
  hideEmptyState();
  const wrapper = document.createElement("article");
  wrapper.className = `message ${role}`;
  const text = document.createElement("div");
  text.className = "message-content";
  if (role === "assistant") renderMessageText(text, content);
  else text.textContent = content;

  if (role === "user") {
    wrapper.append(text);
  } else {
    const head = document.createElement("div");
    head.className = "message-head";
    const name = document.createElement("span");
    name.className = "message-name";
    name.textContent = messageName(role, label);
    const stamp = document.createElement("span");
    stamp.className = "message-time";
    stamp.textContent = time || formatClock();
    head.append(name, stamp);
    wrapper.append(head, text);
    if (role === "assistant") wrapper.append(buildMessageActions(text));
  }

  elements.chatLog.append(wrapper);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  return { wrapper, text };
}

function appendError(error) {
  const message = error instanceof Error ? error.message : String(error);
  appendMessage("error", message, "Request failed");
  setStatus("Error", "error");
  addEvent("error", { message });
}

function startDraft() {
  if (state.draft) return state.draft;
  const draft = appendMessage("assistant", "", "Agent");
  draft.wrapper.classList.add("streaming");
  state.draft = draft;
  state.draftText = "";
  return draft;
}

function appendDelta(content) {
  const text = extractText(content);
  const reasoning = extractReasoning(content);
  if (!text && !reasoning) return;
  const draft = startDraft();
  renderReasoning(draft.text, reasoning, true);
  state.draftText += text;
  state.lastAssistantText = state.draftText;
  renderMessageText(draft.text, state.draftText);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function finishDraft(finalText = "") {
  if (!state.draft) return false;
  if (finalText) {
    state.draftText = finalText;
    state.lastAssistantText = finalText;
    renderMessageText(state.draft.text, finalText);
  }
  state.draft.wrapper.classList.remove("streaming");
  state.draft = null;
  return true;
}

function toolSummary(message) {
  if (message?.name) return `${message.name}\n${extractText(message.content)}`.trim();
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    return message.tool_calls.map((call) => `${call.name || "tool"}(${formatJson(call.args || {})})`).join("\n");
  }
  return extractText(message?.content) || formatJson(message);
}

function handleAgentMessage(message) {
  const role = normalizeRole(message);
  if (role === "user") return;
  if (role === "assistant") {
    const text = extractText(message?.content);
    const reasoning = extractReasoning(message) || extractReasoning(message?.content);
    if (reasoning) renderReasoning(startDraft().text, reasoning);
    if (!text && !message?.tool_calls?.length) return;
    const finished = finishDraft(text);
    if (text && !finished) {
      state.lastAssistantText = text;
      appendMessage("assistant", text, "Agent");
    }
    if (message?.tool_calls?.length) appendMessage("tool", toolSummary(message), "Tool request");
    return;
  }
  appendMessage(role, toolSummary(message), role === "tool" ? "Tool result" : "System");
}

function interruptSummary(interrupt) {
  const requests = interrupt?.value?.action_requests || [];
  if (!requests.length) return "The agent paused and needs a decision.";
  return requests
    .map((request) => `${request.name || "tool"} ${formatJson(request.args || {})}`)
    .join(" · ");
}

function handleInterrupt(interrupt) {
  finishDraft();
  state.pendingInterrupt = interrupt;
  elements.approvalSummary.textContent = interruptSummary(interrupt);
  elements.approvalPanel.hidden = false;
  appendMessage("system", interruptSummary(interrupt), "Approval required");
}

function handleEvent(event) {
  addEvent(event?.type || "event", event);
  if (event?.type === "delta") appendDelta(event.content);
  if (event?.type === "message") handleAgentMessage(event.message);
  if (event?.type === "interrupt") handleInterrupt(event);
  if (event?.type === "run.failed") return;
  if (event?.error) throw new Error(errorMessage(event.error) || "Agent error");
}

function handleOutput(output) {
  for (const item of output || []) {
    if (item?.type === "interrupt") handleInterrupt(item);
    else handleAgentMessage(item);
  }
  finishDraft();
}

function routingHeaders() {
  const headers = {};
  // The UI reuses its stable session value for routing affinity, but the header is routing-only.
  if (state.sessionId) headers["X-Routing-Key"] = state.sessionId;
  return headers;
}

function invocationHeaders() {
  return { "Content-Type": "application/json", ...routingHeaders() };
}

function invocationPayload(payload, transport = {}) {
  const sessionId = ensureSessionId();
  const input = {
    actor: state.config?.session.actor || sessionId,
    ...payload,
  };
  if (state.model) input.model = state.model;
  return { id: newSessionId(), session_id: sessionId, input, ...transport };
}

function agentResult(result) {
  return result?.output && !Array.isArray(result.output) ? result.output : result;
}

function errorMessage(error) {
  return typeof error === "string" ? error : error?.message;
}

async function jsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = errorMessage(body.error) || body.detail || `Request failed with ${response.status}`;
    throw new Error(body.status === "failed" ? `Agent invocation failed: ${message}` : message);
  }
  return body;
}

function stateMessage(container, message, kind = "empty") {
  container.replaceChildren();
  const item = document.createElement("div");
  item.className = `state-${kind}`;
  item.textContent = message;
  container.append(item);
}

function renderStateItems(container, items, emptyMessage, renderItem) {
  container.replaceChildren();
  if (!items.length) {
    stateMessage(container, emptyMessage);
    return;
  }
  for (const value of items) {
    const item = document.createElement("article");
    item.className = "state-item";
    const rendered = renderItem(value);
    const title = document.createElement("strong");
    title.textContent = rendered.title;
    const content = document.createElement("p");
    content.textContent = rendered.content || "No content returned.";
    const meta = document.createElement("small");
    meta.textContent = rendered.meta || "";
    item.append(title, content, meta);
    container.append(item);
  }
}

function memoryEntries(payload) {
  return payload?.managed_memory_entries || [];
}

function sessionItems(payload) {
  return payload?.session_items || [];
}

function sessions(payload) {
  return payload?.sessions || [];
}

// ---- Memory pane -----------------------------------------------------------

const memoryState = { query: "", searchTimer: null };

function prettyDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function prettyDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function iconSvg(className, inner) {
  const span = document.createElement("span");
  span.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  return span.firstChild;
}

// Store name = the trailing segment of "memory-stores/<name>"; resource = the full path.
function memoryStoreName() {
  const store = state.config?.memory.store || "";
  const parts = store.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Memory store";
}

function currentMemoryActor() {
  return (elements.memoryActor.value || "").trim() || state.config?.memory.actor || "";
}

function memoryMessage(text, kind = "empty") {
  elements.memoryEntries.replaceChildren();
  const div = document.createElement("div");
  div.className = `memory-${kind}`;
  div.textContent = text;
  elements.memoryEntries.append(div);
  elements.memoryCount.textContent = "";
}

function renderMemoryCards(entries, query) {
  elements.memoryEntries.replaceChildren();
  elements.memoryCount.textContent = entries.length
    ? query
      ? `${entries.length} matching`
      : `${entries.length} of ${entries.length} entries`
    : "";
  if (!entries.length) {
    memoryMessage(query ? "No entries match your search." : "No memory entries for this actor yet.");
    return;
  }
  for (const entry of entries) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "memory-entry";
    const top = document.createElement("div");
    top.className = "memory-entry-top";
    const path = document.createElement("span");
    path.className = "memory-entry-path";
    path.textContent = entry.path || entry.name || "Memory entry";
    top.append(path, iconSvg("memory-entry-expand icon", '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>'));
    const preview = document.createElement("p");
    preview.className = "memory-entry-preview";
    preview.textContent = extractText(entry.content) || entry.description || "";
    const foot = document.createElement("div");
    foot.className = "memory-entry-foot";
    const actor = document.createElement("span");
    actor.className = "memory-entry-actor";
    actor.textContent = entry.actor_id || "";
    const time = document.createElement("span");
    time.className = "memory-entry-time";
    time.textContent = prettyDate(entry.update_time || entry.create_time);
    foot.append(actor, time);
    card.append(top, preview, foot);
    card.addEventListener("click", () => openMemoryModal(entry));
    elements.memoryEntries.append(card);
  }
}

async function loadMemory() {
  if (!state.config?.memory.enabled) {
    memoryMessage("Connect a Memory Store to browse entries: agentbricks memory bind <store-name>");
    return;
  }
  const query = memoryState.query.trim();
  const actor = currentMemoryActor();
  memoryMessage(query ? "Searching…" : "Loading memory…", "loading");
  try {
    let entries;
    if (query) {
      const response = await fetch(demoUrl("/api/demo/memory/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 50, actor: actor || undefined }),
      });
      entries = memoryEntries(await jsonResponse(response));
    } else {
      const url = demoUrl("/api/demo/memory/entries") + (actor ? `&actor=${encodeURIComponent(actor)}` : "");
      const response = await fetch(url, { cache: "no-store" });
      entries = memoryEntries(await jsonResponse(response));
    }
    renderMemoryCards(entries, query);
    addEvent(query ? "memory.entries.search" : "memory.entries.list", {
      count: entries.length,
      actor,
      query: query || undefined,
    });
  } catch (error) {
    memoryMessage(error instanceof Error ? error.message : String(error), "error");
    addEvent("memory.error", { message: String(error) });
  }
}

function openMemoryPane() {
  elements.leftCard.classList.add("memory-open");
  elements.capabilitiesBlock.hidden = true;
  elements.memoryPane.hidden = false;
  elements.memoryStoreName.textContent = memoryStoreName();
  elements.memoryStoreResource.textContent = state.config?.memory.store || "";
  if (!elements.memoryActor.value) elements.memoryActor.value = state.config?.memory.actor || "";
  void loadMemory();
}

function closeMemoryPane() {
  elements.leftCard.classList.remove("memory-open");
  elements.memoryPane.hidden = true;
  elements.capabilitiesBlock.hidden = false;
}

function openMemoryModal(entry) {
  elements.memoryModalTitle.textContent = entry.path || entry.name || "Memory entry";
  elements.memoryModalBody.textContent = extractText(entry.content) || entry.description || "(no content)";
  elements.memoryModalFoot.textContent = [entry.actor_id, prettyDateTime(entry.update_time || entry.create_time)]
    .filter(Boolean)
    .join(" · ");
  elements.memoryModal.hidden = false;
}

function closeMemoryModal() {
  elements.memoryModal.hidden = true;
}

// ---- Tools pane ------------------------------------------------------------

function toolsSection(title) {
  const heading = document.createElement("h3");
  heading.className = "tools-heading";
  heading.textContent = title;
  elements.toolsBody.append(heading);
}

function toolRow(badge, name, detail) {
  const row = document.createElement("div");
  row.className = "tool-row";
  if (badge) {
    const label = document.createElement("span");
    label.className = "tool-badge";
    label.textContent = badge;
    row.append(label);
  }
  const id = document.createElement("span");
  id.className = "tool-name";
  id.textContent = name;
  row.append(id);
  if (detail) {
    const source = document.createElement("span");
    source.className = "tool-detail";
    source.textContent = detail;
    row.append(source);
  }
  return row;
}

// Render /api/demo/tools into the Tools row (subtitle and orb) and the Tools pane.
// The orb is green once a managed (agent.toml) tool is bound; the sample Python tools don't count.
function renderTools(payload) {
  const connected = payload?.connected || [];
  const local = payload?.local || [];
  const errors = payload?.errors || [];
  elements.toolsMode.textContent = `${connected.length ? `${connected.length} connected` : "None connected"} · ${local.length} in code`;
  setCapability(
    elements.toolsStatus,
    connected.length ? true : "degraded",
    connected.length
      ? `${connected.length} managed tool${connected.length === 1 ? "" : "s"} bound in agent.toml.`
      : "No managed tools are bound in agent.toml.",
  );

  elements.toolsBody.replaceChildren();
  for (const error of errors) {
    const message = document.createElement("div");
    message.className = "state-error";
    message.textContent = error.message;
    elements.toolsBody.append(message);
  }

  toolsSection("Connected");
  if (!connected.length) {
    const empty = document.createElement("div");
    empty.className = "tools-empty";
    empty.textContent = "No managed tools connected yet.";
    elements.toolsBody.append(empty);
  }
  for (const tool of connected) elements.toolsBody.append(toolRow(tool.label, tool.id, tool.source));

  toolsSection("Defined in code");
  if (!local.length) {
    const empty = document.createElement("div");
    empty.className = "tools-empty";
    empty.textContent = "No Python tools found in agent/tools.";
    elements.toolsBody.append(empty);
  }
  for (const tool of local) elements.toolsBody.append(toolRow(null, tool.name, tool.description));

  toolsSection("Add a tool");
  for (const entry of payload?.add_commands || []) {
    const label = document.createElement("span");
    label.className = "cap-command-label";
    label.textContent = entry.label;
    elements.toolsBody.append(label, commandRow(entry.command));
  }
  const hint = document.createElement("p");
  hint.className = "tools-hint";
  const dev = document.createElement("code");
  dev.textContent = "agentbricks dev";
  const deploy = document.createElement("code");
  deploy.textContent = "agentbricks deploy";
  hint.append("Run in your project directory, then restart ", dev, " or run ", deploy, ".");
  elements.toolsBody.append(hint);
}

async function loadTools() {
  try {
    const response = await fetch(demoUrl("/api/demo/tools"), { cache: "no-store" });
    const payload = await jsonResponse(response);
    renderTools(payload);
    addEvent("tools.list", {
      connected: payload.connected.length,
      local: payload.local.length,
      errors: payload.errors,
    });
  } catch (error) {
    elements.toolsMode.textContent = "Unavailable";
    setCapability(elements.toolsStatus, false, "The tools list could not be loaded.");
    stateMessage(elements.toolsBody, error instanceof Error ? error.message : String(error), "error");
    addEvent("tools.error", { message: String(error) });
  }
}

function openToolsPane() {
  elements.leftCard.classList.add("tools-open");
  elements.capabilitiesBlock.hidden = true;
  elements.toolsPane.hidden = false;
  void loadTools();
}

function closeToolsPane() {
  elements.leftCard.classList.remove("tools-open");
  elements.toolsPane.hidden = true;
  elements.capabilitiesBlock.hidden = false;
}

function renderSessionItems(items) {