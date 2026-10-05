"""Choosing the LLM for a request: the server's own, or one built from the user's own key."""
import re
from dataclasses import dataclass
from typing import Annotated, Callable

from fastapi import Depends, Header

from app.config import Settings, get_settings
from app.errors import bad_request
from app.llm.client import LLM, PROVIDER_NAMES, GeminiLLM, OpenAILLM, get_llm

# The model name is placed into a URL path by the Gemini SDK, so it is validated strictly.
_MODEL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:\-]{0,79}$")
_KEY = re.compile(r"^[\x21-\x7e]{20,400}$")  # printable ASCII without spaces


@dataclass(frozen=True)
class ByokConfig:
    provider: str
    api_key: str = ""
    model: str | None = None

    def __repr__(self) -> str:  # never let the key reach a log line through repr()
        return f"ByokConfig(provider={self.provider!r}, model={self.model!r}, api_key=<hidden>)"


def parse_byok(provider: str | None, api_key: str | None, model: str | None) -> ByokConfig | None:
    """Validate the optional X-LLM-* headers. Returns None when the caller did not send a key."""
    if not api_key and not provider and not model:
        return None
    if not api_key:
        raise bad_request("invalid_llm_key", "An API key is required to use your own provider.")
    name = (provider or "").strip().lower()
    if name not in PROVIDER_NAMES:
        raise bad_request("invalid_llm_provider", "Choose Gemini or OpenAI as the provider.")
    key = api_key.strip()
    if not _KEY.match(key):
        raise bad_request("invalid_llm_key", "That does not look like a valid API key.")
    chosen = (model or "").strip() or None
    if chosen and not _MODEL.match(chosen):
        raise bad_request("invalid_llm_model", "That model name is not valid.")
    return ByokConfig(provider=name, api_key=key, model=chosen)


LLMFactory = Callable[[Settings, ByokConfig | None], LLM]


def build_llm(settings: Settings, byok: ByokConfig | None) -> LLM:
    if byok is None:
        return get_llm()
    if byok.provider == "openai":
        return OpenAILLM(settings, api_key=byok.api_key, model=byok.model, byok=True)
    return GeminiLLM(settings, api_key=byok.api_key, model=byok.model, byok=True)


def get_llm_factory() -> LLMFactory:
    return build_llm  # a dependency so tests can swap in a fake


async def get_byok(
    provider: Annotated[str | None, Header(alias="X-LLM-Provider")] = None,
    api_key: Annotated[str | None, Header(alias="X-LLM-Key")] = None,
    model: Annotated[str | None, Header(alias="X-LLM-Model")] = None,
) -> ByokConfig | None:
    return parse_byok(provider, api_key, model)


async def get_request_llm(
    byok: ByokConfig | None = Depends(get_byok),
    settings: Settings = Depends(get_settings),
    factory: LLMFactory = Depends(get_llm_factory),
) -> LLM:
    """The server's LLM, or one built from the user's own key for this request only."""
    return factory(settings, byok)
