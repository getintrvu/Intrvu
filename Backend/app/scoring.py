"""Deterministic V4 scoring (see docs/scoring-spec-v4.md).

Every function turns LLM-extracted evidence into a component dict shaped exactly as the
extension UI consumes it: {"score": {...}, "analysis": {...}}. No function here calls the LLM, so
the same evidence always produces the same score.
"""
import re
from typing import Any

from app.llm.models import JobFitExtraction, QualityExtraction

Component = dict[str, Any]

# (minimum points, rating, symbol), checked from the top.
Bands = list[tuple[float, str, str]]

KEYWORD_BANDS: Bands = [(30, "Excellent", "✅"), (24, "Good", "👍"), (18, "Fair", "⚠️"), (12, "Needs Improvement", "🛑"), (0, "Poor", "❌")]
EXPERIENCE_BANDS: Bands = [(24, "Strong Match", "✅"), (18, "Good Alignment", "👍"), (12, "Partial Match", "⚠️"), (6, "Weak Match", "🛑"), (0, "No Relevant Experience", "❌")]
SKILLS_BANDS: Bands = [(13, "Excellent", "✅"), (10, "Good", "👍"), (7, "Fair", "⚠️"), (4, "Needs Improvement", "🛑"), (0, "Poor", "❌")]
STRUCTURE_BANDS: Bands = [(27, "Excellent", "✅"), (22.5, "Good", "👍"), (15, "Fair", "⚠️"), (0, "Needs Improvement", "🛑")]
QUARTER_BANDS: Bands = [(20, "Excellent", "✅"), (15, "Good", "👍"), (10, "Fair", "⚠️"), (5, "Needs Improvement", "🛑"), (0, "Poor", "❌")]  # max 25
BULLET_BANDS: Bands = [(18, "Excellent", "✅"), (14, "Good", "👍"), (10, "Fair", "⚠️"), (6, "Needs Improvement", "🛑"), (0, "Poor", "❌")]

JOB_FIT_LABELS = [(90, "Great Match", "✅"), (75, "Good Match", "👍"), (60, "Moderate Match", "⚠️"), (0, "Low Fit", "🛠")]
QUALITY_LABELS = [(90, "Ready to Impress", "✅"), (70, "Needs Polish", "⚠️"), (0, "Refine for Impact", "🛠")]

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?<!\d)(?:\+?\d[\d\s().-]{8,}\d)(?!\d)")
_LINK = re.compile(r"(?:https?://|www\.|linkedin\.com/|github\.com/)\S+", re.I)


def _round(value: float, digits: int = 1) -> float:
    return round(float(value), digits)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _pct(part: float, whole: float) -> float:
    return _round(part / whole * 100) if whole else 0.0


def rating_for(points: float, bands: Bands) -> tuple[str, str]:
    for minimum, rating, symbol in bands:
        if points >= minimum:
            return rating, symbol
    return bands[-1][1], bands[-1][2]


def label_for(score: float, labels: list[tuple[int, str, str]]) -> tuple[str, str]:
    for minimum, label, symbol in labels:
        if score >= minimum:
            return label, symbol
    return labels[-1][1], labels[-1][2]


def _score_block(points: float, max_points: int, bands: Bands, **extra: Any) -> dict[str, Any]:
    rating, symbol = rating_for(points, bands)
    return {"pointsAwarded": _round(points), "maxPoints": max_points, "rating": rating, "ratingSymbol": symbol, **extra}


# ------------------------------------------------------------------ job fit components
def score_keywords(ex: JobFitExtraction) -> Component:
    """35 pts. Strong +2, partial +1; missing -1 and stuffing -2 with penalties capped at 40%."""
    strong, partial = len(ex.strong_keywords), len(ex.partial_keywords)
    missing, stuffed = len(ex.missing_keywords), len(ex.stuffed_keywords)

    positive = min(2 * strong + partial, 35)
    penalty = min(missing + 2 * stuffed, 14)
    points = _clamp(positive - penalty, 0, 35)

    return {
        "score": _score_block(
            points, 35, KEYWORD_BANDS,
            matchPercentage=_pct(strong + 0.5 * partial, strong + partial + missing),
        ),
        "analysis": {
            "strongMatches": [
                {"keyword": k.keyword, "points": 2, "context": k.evidence, "status": "Strong Match", "symbol": "✅"}
                for k in ex.strong_keywords
            ],
            "partialMatches": [
                {"keyword": k.keyword, "points": 1, "context": k.evidence, "status": "Partial Match", "symbol": "⚠️"}
                for k in ex.partial_keywords
            ],
            "missingKeywords": [
                {"keyword": k, "points": -1, "status": "Missing Critical", "symbol": "❌"} for k in ex.missing_keywords
            ],
            "keywordStuffing": [
                {"keyword": s.keyword, "points": -2, "occurrences": s.occurrences, "status": "Keyword Stuffing", "symbol": "🚫"}
                for s in ex.stuffed_keywords
            ],
            "suggestedImprovements": ex.keyword_advice,
        },
    }


def score_experience(ex: JobFitExtraction) -> Component:
    """30 pts. Strong +3, partial +1.5, misaligned -1, normalized by expected_max (spec 5.2)."""
    strong = [r for r in ex.roles if r.fit == "strong"]
    partial = [r for r in ex.roles if r.fit == "partial"]
    misaligned = [r for r in ex.roles if r.fit == "misaligned"]

    raw = 3 * len(strong) + 1.5 * len(partial) - len(misaligned)
    relevant = len(strong) + len(partial)
    expected_max = max(min(relevant * 3, 12), 1)
    points = _clamp(raw / expected_max * 30, 0, 30)

    def item(role, pts, status, symbol):
        return {"role": role.role, "points": pts, "status": status, "notes": role.notes, "symbol": symbol}

    return {
        "score": _score_block(
            points, 30, EXPERIENCE_BANDS,
            alignmentPercentage=_pct(points, 30),
            rawScore=_round(raw), expectedMax=expected_max, numberOfRelevantRoles=relevant,
        ),
        "analysis": {
            "strongMatches": [item(r, 3, "Strong Match", "✅") for r in strong],
            "partialMatches": [item(r, 1.5, "Partial Match", "⚠️") for r in partial],
            "misalignedRoles": [item(r, -1, "Misaligned", "❌") for r in misaligned],
            "suggestedImprovements": ex.experience_advice,
        },
    }


_DEGREE_TYPES = {
    "bachelor": "Bachelor's",
    "master": "Master's",
    "doctorate": "PhD",
    "associate_or_diploma": "Associate",
    "none": "None",
}


def score_education(ex: JobFitExtraction) -> Component:
    """20 pts, binary gate: a bachelor's degree or higher earns all 20, anything else 0."""
    passed = ex.degree.level in {"bachelor", "master", "doctorate"}
    points = 20 if passed else 0
    advice = (
        f"Your {ex.degree.degree_found} meets the education requirement."
        if passed
        else ex.education_advice or "Add a Bachelor's degree or equivalent if you have one."
    )
    return {
        "score": {
            "pointsAwarded": points,
            "maxPoints": 20,
            "passed": passed,
            "rating": "Requirement Met" if passed else "Requirement Not Met",
            "ratingSymbol": "✅" if passed else "❌",
        },
        "analysis": {
            "degreeFound": ex.degree.degree_found,
            "degreeType": _DEGREE_TYPES[ex.degree.level],
            "fieldOfStudy": ex.degree.field_of_study,
            "status": "Pass" if passed else "Fail",
            "symbol": "✅" if passed else "❌",
            "suggestedImprovements": advice,
            "educationMatch": [],
            "certificationMatches": [],
            "missingCredentials": [],
        },
    }


def score_skills(ex: JobFitExtraction) -> Component:
    """15 pts. Hard +1, soft +0.5 (halved if already credited in experience), missing -1."""
    reductions: list[dict[str, Any]] = []

    def credit(hits, full):
        items = []
        for hit in hits:
            pts = full / 2 if hit.also_in_experience else full
            if hit.also_in_experience:
                reductions.append(
                    {"skill": hit.skill, "originalPoints": full, "reducedPoints": pts, "reason": "Also found in experience"}
                )
            items.append(
                {"skill": hit.skill, "points": pts, "deduplicationApplied": hit.also_in_experience, "status": "Found", "symbol": "✅"}
            )
        return items

    hard = credit(ex.hard_skills, 1.0)
    soft = credit(ex.soft_skills, 0.5)
    missing = [
        {"skill": m.skill, "points": -1, "skillType": m.skill_type, "status": "Missing Critical", "symbol": "❌"}
        for m in ex.missing_skills
    ]
    points = _clamp(sum(i["points"] for i in hard + soft) - len(missing), 0, 15)
    matched = len(hard) + len(soft)

    return {
        "score": _score_block(points, 15, SKILLS_BANDS, matchPercentage=_pct(matched, matched + len(missing))),
        "analysis": {
            "hardSkillMatches": hard,
            "softSkillMatches": soft,
            "missingSkills": missing,
            "doubleCountReductions": reductions,
            "suggestedImprovements": ex.skills_advice,
        },
    }


# ------------------------------------------------------------------ resume quality components
_REQUIRED = [
    ("Personal Information", "personal_information"),
    ("Website/Social Links", "links"),
    ("Work Experience", "work_experience"),
    ("Education", "education"),
]
_NICE = [
    ("Professional Summary", "professional_summary"),
    ("Skills and Interests", "skills"),
    ("Certifications", "certifications"),
    ("Projects", "projects"),
    ("Awards/Achievements", "awards"),
    ("Volunteering", "volunteering"),
    ("Publications", "publications"),
]


def score_structure(ex: QualityExtraction, resume_text: str) -> Component:
    """30 pts: 7.5 per required section. Contact details and links are also checked with
    regexes so a model miss cannot drop them."""
    present = ex.sections.model_dump()
    present["personal_information"] = present["personal_information"] or bool(_EMAIL.search(resume_text) or _PHONE.search(resume_text))
    present["links"] = present["links"] or bool(_LINK.search(resume_text))

    status = []
    done_required = 0
    for name, key in _REQUIRED:
        ok = present[key]
        done_required += ok
        status.append({"section": name, "type": "must-have", "status": "Completed" if ok else "Missing", "symbol": "✅" if ok else "❌"})
    done_nice = 0
    for name, key in _NICE:
        ok = present[key]
        done_nice += ok
        status.append({"section": name, "type": "nice-to-have", "status": "Completed" if ok else "Missing", "symbol": "💡" if ok else "⚪"})

    missing = [name for name, key in _REQUIRED if not present[key]]
    points = done_required * 7.5
    advice = f"Add the missing sections: {', '.join(missing)}." if missing else ex.structure_advice
    return {
        "score": _score_block(
            points, 30, STRUCTURE_BANDS,
            completedMustHave=done_required, totalMustHave=len(_REQUIRED),
            completedNiceToHave=done_nice, totalNiceToHave=len(_NICE), bonusPoints=0,
        ),
        "analysis": {"sectionStatus": status, "missingRequiredSections": missing, "suggestedImprovements": advice},
    }


def score_action_words(ex: QualityExtraction) -> Component:
    """25 pts. Strong verb +1 (capped), weak verb -0.5, cliche -1."""
    strong, weak, cliches = len(ex.strong_verbs), len(ex.weak_verbs), len(ex.cliches)
    points = _clamp(min(strong, 25) - 0.5 * weak - cliches, 0, 25)
    return {
        "score": _score_block(points, 25, QUARTER_BANDS, actionVerbPercentage=_pct(strong, strong + weak)),
        "analysis": {
            "strongActionVerbs": [
                {"bulletPoint": v.bullet, "actionVerb": v.verb, "points": 1, "status": "Strong Action Word", "symbol": "✅"}
                for v in ex.strong_verbs
            ],
            "weakActionVerbs": [
                {"bulletPoint": v.bullet, "actionVerb": v.verb, "points": -0.5, "suggestedReplacement": v.suggested_replacement, "status": "Weak Action Word", "symbol": "⚠️"}
                for v in ex.weak_verbs
            ],
            "clichesAndBuzzwords": [
                {"phrase": c.phrase, "points": -1, "suggestedReplacement": c.suggested_replacement, "status": "Cliché/Buzzword", "symbol": "🚫"}
                for c in ex.cliches
            ],
            "suggestedImprovements": ex.action_words_advice,
        },
    }


def score_measurable(ex: QualityExtraction) -> Component:
    """25 pts. 2.5 per quantified bullet; outcome language without numbers earns up to +1 total."""
    quantified = len(ex.quantified_bullets)
    partial = min(max(ex.outcome_language_count, 0) * 0.5, 1.0)
    points = _clamp(2.5 * quantified + partial, 0, 25)
    return {
        "score": _score_block(points, 25, QUARTER_BANDS, measurableResultsCount=quantified),
        "analysis": {
            "measurableResults": [
                {"bulletPoint": q.bullet, "metric": q.metric, "points": 2.5, "symbol": "✅"} for q in ex.quantified_bullets
            ],
            "opportunitiesForMetrics": [
                {"bulletPoint": o.bullet, "suggestion": o.suggestion, "symbol": "❌"} for o in ex.metric_opportunities
            ],
            "suggestedImprovements": ex.measurable_advice,
        },
    }


def _length_ok(bullet: str) -> bool:
    words, chars = len(bullet.split()), len(bullet)
    return 12 <= words <= 20 or 85 <= chars <= 120


def score_bullets(ex: QualityExtraction) -> Component:
    """20 pts over at most 10 bullets. Effective (well structured AND 12-20 words or 85-120
    chars) +2, otherwise -0.5. Length is measured here, not by the model."""
    effective, ineffective = [], []
    for review in ex.bullets[:10]:
        words, chars = len(review.bullet.split()), len(review.bullet)
        base = {"bulletPoint": review.bullet, "wordCount": words, "characterCount": chars}
        if review.well_structured and _length_ok(review.bullet):
            effective.append({**base, "points": 2, "status": "Effective", "strengths": review.strengths, "symbol": "✅"})
        else:
            issues = review.issues
            if not _length_ok(review.bullet):
                issues = f"{issues} Aim for 12-20 words (this has {words}).".strip()
            ineffective.append(
                {**base, "points": -0.5, "status": "Ineffective", "issues": issues, "suggestedRevision": review.suggested_revision, "symbol": "❌"}
            )
    points = _clamp(2 * len(effective) - 0.5 * len(ineffective), 0, 20)
    return {
        "score": _score_block(points, 20, BULLET_BANDS, effectiveBulletPercentage=_pct(len(effective), len(effective) + len(ineffective))),
        "analysis": {
            "effectiveBullets": effective,
            "ineffectiveBullets": ineffective,
            "suggestedImprovements": ex.bullets_advice,
        },
    }


# ------------------------------------------------------------------ totals
def total_points(*components: Component) -> float:
    return _round(min(sum(c["score"]["pointsAwarded"] for c in components), 100))


def overall(total: float, labels: list[tuple[int, str, str]]) -> dict[str, Any]:
    label, symbol = label_for(total, labels)
    return {"total_points": total, "percentage": round(total), "label": label, "symbol": symbol}
