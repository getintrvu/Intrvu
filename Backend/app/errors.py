"""Application errors with stable machine-readable codes the extension can branch on."""
import logging

from fastapi import Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def bad_request(code: str, message: str) -> AppError:
    return AppError(400, code, message)


def unauthorized(message: str = "Please sign in to continue.") -> AppError:
    return AppError(401, "unauthorized", message)


def payload_too_large(limit_mb: int) -> AppError:
    return AppError(413, "file_too_large", f"The PDF is too large (max {limit_mb} MB).")


def quota_exceeded(used: int, limit: int) -> AppError:
    return AppError(
        429,
        "quota_exceeded",
        f"You have used all {limit} analyses for today. Come back tomorrow.",
    )


def service_unavailable(code: str = "service_unavailable", message: str | None = None) -> AppError:
    return AppError(503, code, message or "The service is temporarily unavailable. Please try again.")


def analysis_failed() -> AppError:
    return AppError(502, "analysis_failed", "We could not analyze this resume. Please try again.")


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


async def unhandled_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled error: %s", type(exc).__name__, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "Something went wrong. Please try again."}},
    )
