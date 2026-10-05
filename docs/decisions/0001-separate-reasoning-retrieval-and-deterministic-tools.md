# ADR 0001 - Separate reasoning, retrieval and deterministic tools

**Decision:** Do not make every capability an agent. Use agents for reasoning, AI Search for retrieval, Genie for semantic analytics, UC Functions for deterministic business logic, and `ai_decide` for structured decisions where appropriate.

**Why:** This improves explainability, governance, testability and cost control.
