"""Gemini client with structured output, bounded retries, and a small interface that tests fake."""
import asyncio
import logging
from functools import lru_cache
from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.config import Settings, get_settings
from app.errors import AppError, analysis_failed, service_unavailable

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_TRANSIENT_CODES = {429, 500, 502, 503, 504}


class LLM(Protocol):
    async def extract(self, schema: type[T], system: str, prompt: str) -> T: ...


class GeminiLLM:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = None

    def _get_client(self):
        # Imported lazily: keeps serverless cold starts light and lets the app boot without a key.
        if self._client is None:
            from google import genai
            from google.genai import types

            if not self._settings.gemini_api_key:
                raise service_unavailable("llm_not_configured", "The analysis service is not configured.")
            self._client = genai.Client(
                api_key=self._settings.gemini_api_key,
                http_options=types.HttpOptions(timeout=int(self._settings.llm_timeout_seconds * 1000)),
            )
        return self._client

    async def extract(self, schema: type[T], system: str, prompt: str) -> T:
        from google.genai import errors, types

        client = self._get_client()
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
        )
        attempts = max(self._settings.llm_max_attempts, 1)
        for attempt in range(1, attempts + 1):
            try:
                response = await client.aio.models.generate_content(
                    model=self._settings.llm_model, contents=prompt, config=config
                )
                parsed = response.parsed
                if isinstance(parsed, schema):
                    return parsed
                if response.text:  # parsed can be empty even when the JSON itself is fine
                    return schema.model_validate_json(response.text)
                logger.warning("LLM returned no content (attempt %d/%d)", attempt, attempts)
            except errors.APIError as exc:
                logger.warning("Gemini API error %s (attempt %d/%d)", exc.code, attempt, attempts)
                if exc.code not in _TRANSIENT_CODES:
                    raise analysis_failed() from exc
                if attempt == attempts:
                    raise service_unavailable(
                        "llm_busy", "The analysis service is busy right now. Please try again shortly."
                    ) from exc
            except (ValueError, TimeoutError, asyncio.TimeoutError) as exc:
                # Bad JSON / schema mismatch / timeout: worth one more try.
                logger.warning("LLM output problem: %s (attempt %d/%d)", type(exc).__name__, attempt, attempts)
            except AppError:
                raise
            await asyncio.sleep(1.0 * attempt)
        raise analysis_failed()


@lru_cache
def get_llm() -> LLM:
    return GeminiLLM(get_settings())
