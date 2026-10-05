# Repository Guide

This repository is intentionally populated before Notebook 00 so the video can begin by explaining the engineering structure and source material.

## What exists on day one

- Complete synthetic source corpus: 45 research documents across five fictional companies.
- Structured portfolio seed data.
- Semi-structured Excel sources.
- Private evaluation ground truth kept outside the production data path.
- Prompt-injection test document kept outside the research ingestion path.
- Architecture and video documentation.
- Configuration contracts for governance, semantics, evaluation and security.
- A real Python package skeleton, tests, and deployment/app folders that will be populated as capabilities become stable.

## What we deliberately do not pre-build

We do not include completed Research Agent, Portfolio Agent, Supervisor, AI Search, Genie, or Databricks App implementations on day one. Those are built during the video series and then promoted from notebooks into `src/`.

This lets the audience see the complete build while still starting from a professional repository rather than a folder full of notebooks.
