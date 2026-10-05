"""ATS-friendliness checks on the PDF itself (spec v4, appendix C).

The extracted text cannot show how a resume is laid out, so this looks at where text sits on the
page and at the embedded images. Every function is defensive: a PDF we cannot analyze produces an
empty report, never an error, so layout checking can never block an analysis.
"""
import io
import logging
import re
from dataclasses import dataclass, field

from pypdf import PdfReader

logger = logging.getLogger(__name__)

# A resume with this many separate "blocks side by side" lines is treated as multi-column / tabular.
MIN_SIDE_BY_SIDE_LINES = 6
MIN_BLOCK_CHARS = 15  # shorter right-hand text is a right-aligned date, not a column
MAX_IMAGES_BEFORE_EXCESSIVE = 3


@dataclass(frozen=True)
class LayoutIssue:
    issue: str
    detail: str


@dataclass
class LayoutReport:
    issues: list[LayoutIssue] = field(default_factory=list)
    image_count: int = 0
    side_by_side_lines: int = 0


def _side_by_side_lines(layout_text: str) -> int:
    """Lines where two substantial blocks of text sit next to each other (columns or tables).

    pypdf's layout mode keeps horizontal spacing, so a column gap is a run of spaces. A short block
    on the right (a right-aligned date) is not a column, so it does not count.
    """
    lines = [line.rstrip() for line in layout_text.splitlines() if line.strip()]
    if not lines:
        return 0
    width = max(len(line) for line in lines)
    if width < 40:
        return 0

    count = 0
    for line in lines:
        # blocks of text separated by 4+ spaces: (start column, length)
        blocks = [(m.start(), len(m.group())) for m in re.finditer(r"\S.*?(?=\s{4,}|\s*$)", line)]
        if len(blocks) < 2:
            continue
        left_ok = blocks[0][1] >= 6 and blocks[0][0] < 0.3 * width
        right_ok = any(length >= MIN_BLOCK_CHARS and start > 0.33 * width for start, length in blocks[1:])
        if left_ok and right_ok:
            count += 1
    return count


def _count_images(page) -> int:
    """Embedded raster images on a page (cheap: does not decode them)."""
    try:
        xobjects = page["/Resources"]["/XObject"].get_object()
    except (KeyError, AttributeError, TypeError):
        return 0
    return sum(1 for ref in xobjects.values() if ref.get_object().get("/Subtype") == "/Image")


def analyze_layout(data: bytes, max_pages: int = 10) -> LayoutReport:
    report = LayoutReport()
    try:
        reader = PdfReader(io.BytesIO(data))
        for page in reader.pages[:max_pages]:
            try:
                report.side_by_side_lines += _side_by_side_lines(page.extract_text(extraction_mode="layout") or "")
            except Exception:
                logger.info("Layout check skipped for a page")
            try:
                report.image_count += _count_images(page)
            except Exception:
                pass
    except Exception:
        logger.info("Layout check skipped: PDF could not be analyzed")
        return LayoutReport()

    if report.side_by_side_lines >= MIN_SIDE_BY_SIDE_LINES:
        report.issues.append(
            LayoutIssue(
                "Multi-column or table layout",
                "Text sits side by side in columns or tables, which many applicant tracking systems read out of order. "
                "Use a single column.",
            )
        )
    if report.image_count >= MAX_IMAGES_BEFORE_EXCESSIVE:
        report.issues.append(
            LayoutIssue(
                "Many images or icons",
                f"The PDF contains {report.image_count} embedded images. Text inside images cannot be read by most "
                "applicant tracking systems; keep graphics minimal.",
            )
        )
    return report


# Section headings applicant tracking systems recognise. Anything else is "non-standard".
_STANDARD_HEADINGS = (
    "summary|professional summary|executive summary|career summary|profile|professional profile|about|about me|"
    "objective|career objective|experience|work experience|professional experience|relevant experience|"
    "employment|employment history|work history|career history|education|academic background|education and training|"
    "skills|technical skills|key skills|core skills|core competencies|skills and tools|skills and interests|"
    "projects|personal projects|selected projects|certifications|certificates|licenses|licenses and certifications|"
    "awards|honors|honours|achievements|awards and achievements|accomplishments|publications|research|"
    "volunteering|volunteer experience|volunteer work|languages|interests|hobbies|references|contact|contact information|"
    "personal information|personal details|links|courses|training|leadership|activities|extracurricular activities"
)
_STANDARD = {h for h in _STANDARD_HEADINGS.split("|")}


def _normalize_heading(text: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in text.replace("&", " and "))
    return " ".join(cleaned.split())


def nonstandard_headings(headings: list[str]) -> list[str]:
    """Section headings (as found in the resume) that an ATS may not recognise."""
    seen: set[str] = set()
    result: list[str] = []
    for heading in headings:
        key = _normalize_heading(heading)
        if key and key not in _STANDARD and key not in seen:
            seen.add(key)
            result.append(heading.strip())
    return result
