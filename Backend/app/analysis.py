"""Runs the two LLM extractions in parallel and turns the evidence into scored results."""
import asyncio
import logging
import time

from app import scoring
from app.config import Settings
from app.llm import prompts
from app.llm.client import LLM
from app.llm.models import JobFitExtraction, QualityExtraction
from app.schemas import AnalyzeResponse, EngineInfo, JobContext, JobInput
from app.text import clean_text

logger = logging.getLogger(__name__)

SCORING_VERSION = "v5.0"


async def analyze(resume_text: str, job: JobInput, llm: LLM, settings: Settings) -> AnalyzeResponse:
    """Raises AppError if either extraction fails; a partial result is never returned."""
    started = time.monotonic()
    job_text = clean_text(job.description, settings.max_job_chars)
    resume_text = clean_text(resume_text, settings.max_resume_chars)

    fit_ex, quality_ex = await asyncio.gather(
        llm.extract(JobFitExtraction, prompts.SYSTEM, prompts.job_fit_prompt(resume_text, job_text)),
        llm.extract(QualityExtraction, prompts.SYSTEM, prompts.quality_prompt(resume_text)),
    )

    keyword = scoring.score_keywords(fit_ex)
    experience = scoring.score_experience(fit_ex)
    education = scoring.score_education(fit_ex)
    skills = scoring.score_skills(fit_ex)

    structure = scoring.score_structure(quality_ex, resume_text)
    action_words = scoring.score_action_words(quality_ex)
    measurable = scoring.score_measurable(quality_ex)
    bullets = scoring.score_bullets(quality_ex)

    fit_total = scoring.total_points(keyword, experience, education, skills)
    quality_total = scoring.total_points(structure, action_words, measurable, bullets)
    elapsed = time.monotonic() - started
    logger.info("Analysis done in %.1fs (fit=%.1f quality=%.1f)", elapsed, fit_total, quality_total)

    return AnalyzeResponse(
        version=SCORING_VERSION,
        job_context=JobContext(
            title=job.jobTitle or "Job Position",
            company=job.company or "Company",
            description_length=len(job.description),
        ),
        job_fit_score=scoring.overall(fit_total, scoring.JOB_FIT_LABELS),
        resume_quality_score=scoring.overall(quality_total, scoring.QUALITY_LABELS),
        detailed_analysis={
            "keyword_match": keyword,
            "job_experience": experience,
            "education_certifications": education,
            "skills_tools": skills,
            "resume_structure": structure,
            "action_words": action_words,
            "measurable_results": measurable,
            "bullet_point_effectiveness": bullets,
        },
        engine=EngineInfo(provider=llm.provider, model=llm.model, own_key=llm.byok),
        process_time_seconds=round(elapsed, 2),
    )
