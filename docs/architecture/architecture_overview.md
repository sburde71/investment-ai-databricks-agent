# Investment AI Architecture

The POC follows a business-first flow:

```text
Synthetic investment sources
        ->
Data ingestion and preparation
        ->
Unity Catalog governance + business semantics
        ->
AI Search / governed tools / decisioning
        ->
Research + Portfolio specialist agents
        ->
Supervisor orchestration
        ->
Responses API + MLflow evaluation/observability
        ->
Databricks Apps + Lakebase session memory
        ->
Trusted investment research and portfolio answers
```

The architecture intentionally uses different capabilities for different jobs:

- AI Search for retrieval over research documents.
- Genie and semantic assets for governed business analytics.
- UC Functions for deterministic portfolio logic.
- `ai_decide` for structured decisioning where appropriate.
- Agents for reasoning and orchestration.
- MLflow for traces, evaluation, feedback and monitoring.
- Lakebase for persistent session state.
