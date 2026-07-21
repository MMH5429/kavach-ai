"""Pydantic request/response models for the Kavach API."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---- M1: scam detection ----
class ScamDetectRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
    threshold: float = Field(default=60.0, ge=0, le=100)


class EvidenceSpan(BaseModel):
    span: str
    start: int
    end: int
    category: str
    rule: str


class RuleContribution(BaseModel):
    rule: str
    label: str
    matched_terms: list[str]
    weight_pct: float


class ScamDetectResponse(BaseModel):
    risk_score: float
    verdict: str
    is_scam: bool
    category: str
    indicators: list[str]
    threshold: float
    evidence: list[EvidenceSpan]
    contributions: list[RuleContribution]


# ---- M4: citizen shield ----
class ShieldRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    language: Literal["en", "hi", "kn", "ta", "te"] = "en"


class ShieldResponse(BaseModel):
    risk_level: str
    scam_type: str
    verdict_en: str
    verdict_local: str
    language: str
    matched_advisories: list[str]
    engine: Literal["gemini", "rules"]


# ---- evidence export ----
class EvidenceExportRequest(BaseModel):
    case_title: str = "Untitled Case"
    analyst: str = "Kavach Analyst"
    artifacts: dict[str, Any] = Field(default_factory=dict)


# ---- health ----
class HealthResponse(BaseModel):
    status: str
    onnx_model_loaded: bool
    gemini_configured: bool
    graph_data: dict[str, Any]
