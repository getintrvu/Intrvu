"""PDF validation and text extraction."""
import io
import logging

from pypdf import PdfReader
from pypdf.errors import PyPdfError

from app.errors import bad_request, payload_too_large
from app.text import clean_text

logger = logging.getLogger(__name__)

# Fewer characters than this almost always means a scanned/image-only PDF.
MIN_TEXT_CHARS = 200


def extract_resume_text(data: bytes, *, max_bytes: int, max_pages: int, max_chars: int) -> str:
    """Validate a PDF upload and return its cleaned text. Raises AppError on bad input."""
    if len(data) > max_bytes:
        raise payload_too_large(max_bytes // (1024 * 1024))
    if not data.startswith(b"%PDF-"):
        raise bad_request("invalid_pdf", "That file is not a valid PDF.")

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise bad_request(
                "encrypted_pdf", "This PDF is password protected. Remove the password and try again."
            )
        pages = reader.pages[:max_pages]
        parts: list[str] = []
        total = 0
        for page in pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:  # a single broken page should not fail the whole resume
                logger.warning("Could not extract text from a PDF page")
                continue
            parts.append(page_text)
            total += len(page_text)
            if total >= max_chars:
                break
    except PyPdfError as exc:
        logger.info("Unreadable PDF: %s", type(exc).__name__)
        raise bad_request("invalid_pdf", "We could not read this PDF. Try exporting it again.") from exc

    text = clean_text("\n".join(parts), max_chars)
    if len(text) < MIN_TEXT_CHARS:
        raise bad_request(
            "no_text_in_pdf",
            "We could not find enough text in this PDF. Scanned or image-only resumes are not "
            "supported yet; export a text-based PDF.",
        )
    return text
