"""LLM access with structured output, bounded retries, and a fallback model.

Two providers are supported, Gemini and OpenAI. The server uses its own Gemini key by default; a
user can bring their own key for either provider (see app/llm/factory.py). Provider SDK errors
are normalized into ProviderError so the retry and error-reporting logic is shared.
"""
import asyncio
import logging
from functools import lru_cache
from typing import Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.errors import AppError, analysis_failed, service_unavailable
from app.llm.redact import redact

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

PROVIDER_NAMES = {"gemini": "Gemini", "openai": "OpenAI"}

ErrorKind = Literal["transient", "model_missing", "auth", "quota", "rejected"]


class ProviderError(Exception):
    """A provider failure, classified so callers do not need to know each SDK's exceptions."""

    def __init__(self, kind: ErrorKind, status: int | None = None, message: str = ""):
        super().__init__(message)
        self.kind, self.status, self.message = kind, status, message


class LLM(Protocol):
    provider: str
    model: str
    byok: bool  # True when the user supplied the key

    async def extract(self, schema: type[T], system: str, prompt: str) -> T: ...


class BaseLLM:
    provider = ""

    def __init__(self, settings: Settings, *, api_key: str, model: str, fallback_model: str | None, byok: bool):
        self._settings = settings
        self._api_key = api_key
        self.model = model
        self._fallback = fallback_model
        self.byok = byok
        self._client = None
        self._client_loop: asyncio.AbstractEventLoop | None = None

    def _client_is_stale(self) -> bool:
        """SDK clients are tied to the event loop they were first used on; a serverless runtime may run a
        later request on another loop, so a client from a different loop must be rebuilt."""
        if self._client is None:
            return True
        return self._client_loop is not None and self._client_loop is not asyncio.get_running_loop()

    @property
    def _label(self) -> str:
        return PROVIDER_NAMES.get(self.provider, self.provider)

    def _model_for(self, attempt: int, attempts: int) -> str:
        """The last attempt uses the fallback model (when there is one) if earlier ones failed."""
        if attempts > 1 and attempt == attempts and self._fallback and self._fallback != self.model:
            return self._fallback
        return self.model

    async def _generate(self, schema: type[T], system: str, prompt: str, model: str) -> T:  # pragma: no cover
        raise NotImplementedError

    # ------------------------------------------------------------ errors shown to the user
    def _failure(self, exc: ProviderError) -> AppError:
        """The user-facing error once retries are exhausted (or the error is not retryable)."""
        if exc.kind == "auth":
            if self.byok:
                return AppError(400, "llm_key_rejected", f"{self._label} rejected your API key. Check it in Settings.")
            return service_unavailable("llm_not_configured", "The analysis service is not configured.")
        if exc.kind == "quota" or (exc.kind == "transient" and exc.status == 429 and self.byok):
            if self.byok:
                return AppError(
                    429, "llm_key_quota",
                    f"Your {self._label} key has hit its rate limit or has no credit left. Check your plan and billing.",
                )
            return service_unavailable("llm_busy", "The analysis service is busy right now. Please try again shortly.")
        if exc.kind == "model_missing" and self.byok:
            return AppError(
                400, "llm_model_not_found",
                f"The model '{self.model}' is not available for your {self._label} key. Choose another model in Settings.",
            )
        if exc.kind == "transient":
            return service_unavailable("llm_busy", "The analysis service is busy right now. Please try again shortly.")
        return analysis_failed()

    async def extract(self, schema: type[T], system: str, prompt: str) -> T:
        attempts = max(self._settings.llm_max_attempts, 1)
        last: ProviderError | None = None
        for attempt in range(1, attempts + 1):
            model = self._model_for(attempt, attempts)
            try:
                return await self._generate(schema, system, prompt, model)
            except ProviderError as exc:
                last = exc
                logger.warning(
                    "%s error (%s, status %s) on %s (attempt %d/%d): %s",
                    self._label, exc.kind, exc.status, model, attempt, attempts,
                    redact(exc.message[:200], self._api_key),
                )
                has_next = attempt < attempts
                # A missing model may just be retired: the fallback model gets a chance.
                retryable = exc.kind == "transient" or (exc.kind == "model_missing" and has_next and bool(self._fallback))
                if not retryable or not has_next:
                    raise self._failure(exc) from exc
            except (ValueError, TimeoutError, asyncio.TimeoutError) as exc:
                # Bad JSON / schema mismatch / timeout: worth one more try.
                logger.warning("LLM output problem: %s (attempt %d/%d)", type(exc).__name__, attempt, attempts)
            except AppError:
                raise
            await asyncio.sleep(1.0 * attempt)
        raise self._failure(last) if last else analysis_failed()


# ====================================================================== Gemini
class GeminiLLM(BaseLLM):
    provider = "gemini"

    def __init__(self, settings: Settings, *, api_key: str | None = None, model: str | None = None, byok: bool = False):
        super().__init__(
            settings,
            api_key=api_key if api_key is not None else settings.gemini_api_key,
            model=model or settings.llm_model,
            # A user who picked their own model gets exactly that model; the server's fallback is ours.
            fallback_model=None if (byok and model) else settings.llm_fallback_model,
            byok=byok,
        )

    def _get_client(self):
        # Imported lazily: keeps serverless cold starts light and lets the app boot without a key.
        if self._client_is_stale():
            from google import genai
            from google.genai import types

            if not self._api_key:
                raise service_unavailable("llm_not_configured", "The analysis service is not configured.")
            self._client = genai.Client(
                api_key=self._api_key,
                http_options=types.HttpOptions(timeout=int(self._settings.llm_timeout_seconds * 1000)),
            )
            self._client_loop = asyncio.get_running_loop()
        return self._client

    @staticmethod
    def _classify(exc) -> ProviderError:
        code, message = exc.code, str(exc.message)
        if code in (401, 403) or (code == 400 and "api key" in message.lower()):
            return ProviderError("auth", code, message)
        if code == 404:
            return ProviderError("model_missing", code, message)
        if code in (429, 500, 502, 503, 504):
            return ProviderError("transient", code, message)
        return ProviderError("rejected", code, message)

    async def _generate(self, schema: type[T], system: str, prompt: str, model: str) -> T:
        from google.genai import errors, types

        client = self._get_client()
        config = types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.0,
            seed=self._settings.llm_seed,
            # We never use tools; stop the SDK from running its function-calling loop.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        try:
            response = await client.aio.models.generate_content(model=model, contents=prompt, config=config)
        except errors.APIError as exc:
            raise self._classify(exc) from exc
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            # The connection dropped or timed out before Gemini answered: worth retrying.
            raise ProviderError("transient", None, type(exc).__name__) from exc
        parsed = response.parsed
        if isinstance(parsed, schema):
            return parsed
        if response.text:  # parsed can be empty even when the JSON itself is fine
            return schema.model_validate_json(response.text)
        raise ValueError("The model returned no content")


# ====================================================================== OpenAI
def _supports_sampling_params(model: str) -> bool:
    """Reasoning models (o-series, gpt-5) reject temperature/seed."""
    name = model.lower()
    return not (name.startswith("gpt-5") or (len(name) > 1 and name[0] == "o" and name[1].isdigit()))


class OpenAILLM(BaseLLM):
    provider = "openai"

    def __init__(self, settings: Settings, *, api_key: str, model: str | None = None, byok: bool = True):
        super().__init__(
            settings, api_key=api_key, model=model or settings.openai_model, fallback_model=None, byok=byok,
        )

    def _get_client(self):
        if self._client_is_stale():
            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(api_key=self._api_key, timeout=self._settings.llm_timeout_seconds, max_retries=0)
            self._client_loop = asyncio.get_running_loop()
        return self._client

    @staticmethod
    def _classify(exc) -> ProviderError:
        import openai

        status = getattr(exc, "status_code", None)
        message = str(getattr(exc, "message", exc))
        if isinstance(exc, (openai.AuthenticationError, openai.PermissionDeniedError)):
            return ProviderError("auth", status, message)
        if isinstance(exc, openai.NotFoundError):
            return ProviderError("model_missing", status, message)
        if isinstance(exc, openai.RateLimitError):
            # "insufficient_quota" means no credit left (retrying cannot help); otherwise a rate limit.
            kind = "quota" if getattr(exc, "code", None) == "insufficient_quota" else "transient"
            return ProviderError(kind, status, message)
        if isinstance(exc, (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError)):
            return ProviderError("transient", status, message)
        return ProviderError("rejected", status, message)

    async def _generate(self, schema: type[T], system: str, prompt: str, model: str) -> T:
        import openai

        client = self._get_client()
        extra = {"temperature": 0, "seed": self._settings.llm_seed} if _supports_sampling_params(model) else {}
        try:
            completion = await client.chat.completions.parse(
                model=model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
                response_format=schema,
                **extra,
            )
        except openai.OpenAIError as exc:
            if isinstance(exc, (openai.LengthFinishReasonError, openai.ContentFilterFinishReasonError)):
                raise ProviderError("rejected", None, type(exc).__name__) from exc
            raise self._classify(exc) from exc
        message = completion.choices[0].message
        if message.refusal:
            raise ProviderError("rejected", None, "The model refused the request")
        if message.parsed is None:
            raise ValueError("The model returned no structured output")
        return message.parsed


@lru_cache
def get_llm() -> LLM:
    """The server's own LLM (Gemini with the server key)."""
    return GeminiLLM(get_settings())
