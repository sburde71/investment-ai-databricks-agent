/* =========================================================
   INVESTMENT AI — FINAL UI PATCH v3
   Current-turn workflow status + Investment Synthesis label.
   ========================================================= */

(() => {
  const chatLog = document.querySelector("#chat-log");
  const eventLog = document.querySelector("#event-log");
  const runStatus = document.querySelector("#run-status");

  if (!chatLog) return;

  function getMessages() {
    return [...chatLog.querySelectorAll(".message")];
  }

  function latestUserText() {
    const users = getMessages().filter((m) => m.classList.contains("user"));
    const latest = users.at(-1);
    return (latest?.querySelector(".message-content")?.textContent || "").trim().toLowerCase();
  }

  function latestAssistantText() {
    const assistants = getMessages().filter((m) => m.classList.contains("assistant"));
    const latest = assistants.at(-1);
    return (latest?.querySelector(".message-content")?.textContent || "").trim().toLowerCase();
  }

  function setStage(label, status, statusLabel) {
    const stages = document.querySelectorAll("#investment-agent-flow .agent-flow-stage");

    for (const stage of stages) {
      const title = stage.querySelector(".agent-flow-content strong");
      if ((title?.textContent || "").trim() !== label) continue;

      stage.classList.remove("pending", "running", "complete");
      stage.classList.add(status);

      const statusElement = stage.querySelector(".agent-flow-status");
      if (statusElement) statusElement.textContent = statusLabel;
      return;
    }
  }

  function renameAssistantMessages() {
    chatLog.querySelectorAll(".message.assistant").forEach((message) => {
      const name = message.querySelector(".message-name");
      if (name && name.textContent.trim() === "Agent") {
        name.textContent = "Investment Synthesis";
      }
    });
  }

  function classifyCurrentTurn(question) {
    const portfolioTerms = [
      "portfolio", "fund", "holding", "holdings", "largest holding",
      "position weight", "market value", "exposure", "sector"
    ];

    const riskTerms = [
      "concentration", "breach", "policy", "threshold",
      "limit", "breaches"
    ];

    const researchTerms = [
      "research", "outlook", "earnings", "guidance",
      "key drivers", "business drivers", "catalyst", "catalysts",
      "investment thesis", "company risks", "major risks"
    ];

    const hasPortfolio = portfolioTerms.some((term) => question.includes(term));
    const hasRisk = riskTerms.some((term) => question.includes(term));
    const hasResearch = researchTerms.some((term) => question.includes(term));

    if (hasResearch && hasRisk) {
      return { portfolio: true, research: true, risk: true };
    }

    if (hasPortfolio && hasResearch) {
      return { portfolio: true, research: true, risk: false };
    }

    if (hasRisk) {
      // Backend risk flow first resolves portfolio context.
      return { portfolio: true, research: false, risk: true };
    }

    if (hasResearch) {
      return { portfolio: false, research: true, risk: false };
    }

    return { portfolio: true, research: false, risk: false };
  }

  function syncWorkflowStatus() {
    const flow = document.querySelector("#investment-agent-flow");
    if (!flow) return;

    const question = latestUserText();
    const answer = latestAssistantText();
    const ready = (runStatus?.textContent || "").trim().toLowerCase() === "ready";

    if (!question) return;

    const expected = classifyCurrentTurn(question);

    // When the run has completed, make the workflow reflect only this turn.
    if (ready && answer) {
      setStage(
        "Portfolio Intelligence",
        expected.portfolio ? "complete" : "pending",
        expected.portfolio ? "Completed" : "Not required"
      );

      setStage(
        "Research Intelligence",
        expected.research ? "complete" : "pending",
        expected.research ? "Completed" : "Not required"
      );

      setStage(
        "Risk Intelligence",
        expected.risk ? "complete" : "pending",
        expected.risk ? "Completed" : "Not required"
      );

      setStage("Investment Synthesis", "complete", "Completed");
    }
  }

  function applyFinalInvestmentUI() {
    renameAssistantMessages();
    syncWorkflowStatus();
  }

  const observer = new MutationObserver(applyFinalInvestmentUI);

  observer.observe(chatLog, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  if (eventLog) {
    observer.observe(eventLog, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (runStatus) {
    observer.observe(runStatus, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  applyFinalInvestmentUI();
})();