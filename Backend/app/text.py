"""Text cleaning for untrusted input (resume text, job descriptions)."""
import re

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_BLANK_RUNS = re.compile(r"\n{3,}")
_SPACE_RUNS = re.compile(r"[ \t ]{2,}")


def clean_text(text: str, max_chars: int) -> str:
    """Strip control characters, collapse whitespace, and truncate to max_chars."""
    text = _CONTROL_CHARS.sub("", text.replace("\r\n", "\n").replace("\r", "\n"))
    text = _SPACE_RUNS.sub(" ", text)
    text = _BLANK_RUNS.sub("\n\n", text)
    return text.strip()[:max_chars]
