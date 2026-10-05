"""Keep API keys out of logs and error text."""
import logging
import re

# Common key shapes (Google "AIza...", OpenAI "sk-..." including "sk-proj-...").
_KEY_PATTERNS = re.compile(r"AIza[0-9A-Za-z_\-]{20,}|sk-[A-Za-z0-9_\-]{16,}")


def redact(text: str, *secrets: str | None) -> str:
    """Replace known secrets and anything shaped like an API key."""
    for secret in secrets:
        if secret and len(secret) >= 8:
            text = text.replace(secret, "[redacted]")
    return _KEY_PATTERNS.sub("[redacted]", text)


class RedactingFilter(logging.Filter):
    """Defense in depth: scrubs key-shaped strings from every log record, whatever logs them."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            record.msg = redact(record.getMessage())
            record.args = ()
        except Exception:  # never let log scrubbing break logging
            pass
        return True
