"""API request/response models."""
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JobInput(BaseModel):
    """Job posting sent by the extension. Unknown fields (location, salary, ...) are ignored."""

    model_config = ConfigDict(extra="ignore")

    jobTitle: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    description: str = Field(min_length=100, max_length=60_000)
    url: str | None = Field(default=None, max_length=1000)

    @field_validator("jobTitle", "company", "url", mode="before")
    @classmethod
    def _blank_to_none(cls, value):
        if isinstance(value, str):
            return value.strip() or None
        return value


class OverallScore(BaseModel):
    total_points: float
    percentage: int
    label: str
    symbol: str


class JobContext(BaseModel):
    title: str
    company: str
    description_length: int


class EngineInfo(BaseModel):
    """Which AI produced the analysis."""

    provider: str
    model: str
    own_key: bool


class AnalyzeResponse(BaseModel):
    version: str
    job_context: JobContext
    job_fit_score: OverallScore
    resume_quality_score: OverallScore
    detailed_analysis: dict[str, Any]
    engine: EngineInfo
    process_time_seconds: float


class UsageResponse(BaseModel):
    used: int
    limit: int
    remaining: int


class KeyCheckResponse(BaseModel):
    ok: bool
    provider: str
    model: str
