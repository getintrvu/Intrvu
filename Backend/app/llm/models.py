"""What the LLM is asked to return.

The model only extracts evidence (matches, bullets, which sections exist). It never returns a
score: every number the user sees is computed in app/scoring.py from this evidence.
"""
from typing import Literal

from pydantic import BaseModel


# ---------------------------------------------------------------- job fit extraction
class KeywordHit(BaseModel):
    keyword: str
    evidence: str  # short quote or paraphrase from the resume


class StuffedKeyword(BaseModel):
    keyword: str
    occurrences: int


class RoleAssessment(BaseModel):
    role: str
    fit: Literal["strong", "partial", "misaligned"]
    notes: str


class DegreeEvidence(BaseModel):
    degree_found: str  # exact degree text from the resume, or "None"
    level: Literal["none", "associate_or_diploma", "bachelor", "master", "doctorate"]
    field_of_study: str


class SkillHit(BaseModel):
    skill: str
    also_in_experience: bool  # the skill is also demonstrated in a work experience bullet


class MissingSkill(BaseModel):
    skill: str
    skill_type: Literal["hard", "soft"]


class JobFitExtraction(BaseModel):
    strong_keywords: list[KeywordHit]
    partial_keywords: list[KeywordHit]
    missing_keywords: list[str]
    stuffed_keywords: list[StuffedKeyword]
    keyword_advice: str

    roles: list[RoleAssessment]
    experience_advice: str

    degree: DegreeEvidence
    education_advice: str

    hard_skills: list[SkillHit]
    soft_skills: list[SkillHit]
    missing_skills: list[MissingSkill]
    skills_advice: str


# ---------------------------------------------------------------- resume quality extraction
class SectionsPresent(BaseModel):
    personal_information: bool
    links: bool
    work_experience: bool
    education: bool
    professional_summary: bool
    skills: bool
    certifications: bool
    projects: bool
    awards: bool
    volunteering: bool
    publications: bool


class StrongVerbUse(BaseModel):
    bullet: str
    verb: str


class WeakVerbUse(BaseModel):
    bullet: str
    verb: str
    suggested_replacement: str


class Cliche(BaseModel):
    phrase: str
    suggested_replacement: str


class QuantifiedBullet(BaseModel):
    bullet: str
    metric: str


class MetricOpportunity(BaseModel):
    bullet: str
    suggestion: str


class BulletReview(BaseModel):
    bullet: str  # exact text of a work-experience bullet
    well_structured: bool  # starts with an action verb, states the task, and shows impact
    strengths: str
    issues: str
    suggested_revision: str


class QualityExtraction(BaseModel):
    sections: SectionsPresent
    structure_advice: str

    strong_verbs: list[StrongVerbUse]
    weak_verbs: list[WeakVerbUse]
    cliches: list[Cliche]
    action_words_advice: str

    quantified_bullets: list[QuantifiedBullet]
    metric_opportunities: list[MetricOpportunity]
    outcome_language_count: int  # bullets that describe outcomes but give no numbers
    measurable_advice: str

    bullets: list[BulletReview]  # up to 10 representative bullets
    bullets_advice: str


class KeyCheck(BaseModel):
    """Smallest possible structured reply, used to verify a user-supplied key."""

    ok: bool
