"""Canonical project settings shared by notebooks and production modules."""

from dataclasses import dataclass
import os

@dataclass(frozen=True)
class ProjectSettings:
    catalog: str = os.getenv("INVESTMENT_AI_CATALOG", "workspace")
    research_schema: str = os.getenv("INVESTMENT_AI_RESEARCH_SCHEMA", "investment_ai_research")
    portfolio_schema: str = os.getenv("INVESTMENT_AI_PORTFOLIO_SCHEMA", "investment_ai_portfolio")
    semantics_schema: str = os.getenv("INVESTMENT_AI_SEMANTICS_SCHEMA", "investment_ai_semantics")
    agent_schema: str = os.getenv("INVESTMENT_AI_AGENT_SCHEMA", "investment_ai_agent")

SETTINGS = ProjectSettings()
