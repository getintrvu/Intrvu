import json
import logging

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from app import analysis
from app.auth import User, get_current_user
from app.config import Settings, get_settings
from app.errors import bad_request, quota_exceeded
from app.llm.client import LLM
from app.llm.factory import ByokConfig, get_byok, get_request_llm
from app.llm.models import KeyCheck
from app.layout import analyze_layout
from app.pdf import extract_resume_text
from app.quota import QuotaService, UserDataService, get_quota_service, get_user_data_service
from app.schemas import AnalyzeResponse, JobInput, KeyCheckResponse, UsageResponse
from app.text import clean_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/v1/usage", response_model=UsageResponse)
async def usage(user: User = Depends(get_current_user), quota: QuotaService = Depends(get_quota_service)):
    status = await quota.status(user.id)
    return UsageResponse(used=status.used, limit=status.limit, remaining=status.remaining)


@router.delete("/v1/me/data")
async def delete_my_data(user: User = Depends(get_current_user), data: UserDataService = Depends(get_user_data_service)):
    """Delete everything IntrvuFit stores about the signed-in user. The shared account is kept."""
    await data.delete(user.id)
    logger.info("Deleted IntrvuFit data for %s", user.id)
    return {"deleted": True}


def _parse_job(raw: str, settings: Settings) -> JobInput:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("jobData must be an object")
        if isinstance(data.get("description"), str):
            data["description"] = clean_text(data["description"], settings.max_job_chars)
        return JobInput(**data)
    except (ValueError, ValidationError) as exc:
        raise bad_request(
            "invalid_job_data",
            "The job posting is missing or too short (at least 100 characters of description are required).",
        ) from exc


@router.post("/v1/analyze", response_model=AnalyzeResponse)
async def analyze_resume(
    resume: UploadFile = File(...),
    jobData: str = Form(...),
    user: User = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    llm: LLM = Depends(get_request_llm),
    quota: QuotaService = Depends(get_quota_service),
):
    # Cheap validation first, so bad requests never cost quota or an LLM call.
    job = _parse_job(jobData, settings)
    if not (resume.filename or "").lower().endswith(".pdf"):
        raise bad_request("invalid_pdf", "Only PDF resumes are supported.")
    data = await resume.read(settings.max_pdf_bytes + 1)  # never buffer more than the limit
    resume_text = await run_in_threadpool(
        extract_resume_text,
        data,
        max_bytes=settings.max_pdf_bytes,
        max_pages=settings.max_pdf_pages,
        max_chars=settings.max_resume_chars,
    )
    layout = await run_in_threadpool(analyze_layout, data, settings.max_pdf_pages)

    # Users who bring their own key pay their provider directly, so the daily quota (which exists to
    # cap our own AI spend) does not apply to them.
    if llm.byok:
        return await analysis.analyze(resume_text, job, llm, settings, layout)

    status = await quota.consume(user.id)
    if not status.allowed:
        raise quota_exceeded(status.used, status.limit)

    try:
        return await analysis.analyze(resume_text, job, llm, settings, layout)
    except Exception:
        await quota.release(user.id)  # the user should not pay for our failure
        raise


@router.post("/v1/key/check", response_model=KeyCheckResponse)
async def check_key(
    _user: User = Depends(get_current_user),
    byok: ByokConfig | None = Depends(get_byok),
    llm: LLM = Depends(get_request_llm),
):
    """Verify a user-supplied key with one tiny request. The key is used for this call only."""
    if byok is None:
        raise bad_request("invalid_llm_key", "Send your API key in the X-LLM-Key header.")
    await llm.extract(KeyCheck, "Reply with the requested JSON only.", "Return ok = true.")
    return KeyCheckResponse(ok=True, provider=llm.provider, model=llm.model)
