"""Spec v4: negative caps (section 5) and ATS formatting issues (section 12, appendix C)."""
from app import scoring
from app.layout import LayoutIssue, LayoutReport, analyze_layout, nonstandard_headings
from app.llm.models import MissingSkill, RoleAssessment
from tests.conftest import fit_extraction, make_positioned_pdf, quality_extraction

LONG_LEFT = "Python, SQL, AWS, Docker"          # 24 chars
LONG_RIGHT = "Built a payments platform used by merchants"  # > 15 chars


# ------------------------------------------------------------------ layout detection on real PDFs
def single_column():
    return make_positioned_pdf([(50, 740 - i * 14, f"Line {i}: built and shipped a payments service for merchants") for i in range(30)])


def two_columns():
    items = []
    for i in range(20):
        items.append((50, 740 - i * 14, LONG_LEFT))
        items.append((300, 740 - i * 14, LONG_RIGHT))
    return make_positioned_pdf(items)


def dated_experience():
    """Typical single-column resume: a right-aligned date on the same line as a company name."""
    items = []
    for i in range(15):
        items.append((50, 740 - i * 28, "Senior Engineer, Acme Corporation"))
        items.append((470, 740 - i * 28, "2019 - 2024"))
        items.append((60, 726 - i * 28, "Built a payments platform used by merchants every day"))
    return make_positioned_pdf(items)


def test_a_single_column_resume_has_no_layout_issues():
    assert analyze_layout(single_column()).issues == []


def test_right_aligned_dates_are_not_mistaken_for_columns():
    report = analyze_layout(dated_experience())
    assert report.issues == [], report


def test_two_column_layout_is_flagged():
    report = analyze_layout(two_columns())
    assert [i.issue for i in report.issues] == ["Multi-column or table layout"]
    assert report.side_by_side_lines >= 6


def test_a_pdf_that_cannot_be_analyzed_returns_an_empty_report():
    assert analyze_layout(b"%PDF-1.4 not really a pdf").issues == []
    assert analyze_layout(b"").issues == []


# ------------------------------------------------------------------ non-standard headings
def test_standard_headings_are_recognised_whatever_the_spelling():
    standard = ["Work Experience", "EDUCATION", "Skills & Tools", "Professional Summary:", "Awards and Achievements", "Technical Skills"]
    assert nonstandard_headings(standard) == []


def test_creative_headings_are_flagged_once_each():
    assert nonstandard_headings(["Things I've Built", "Experience", "My Journey", "things i've built"]) == ["Things I've Built", "My Journey"]


# ------------------------------------------------------------------ structure scoring with ATS issues
def test_no_issues_keeps_full_structure_marks():
    result = scoring.score_structure(quality_extraction(), "jane@example.com linkedin.com/in/jane", LayoutReport())
    assert result["score"]["pointsAwarded"] == 30 and result["analysis"]["atsIssues"] == []


def test_each_issue_costs_one_point_including_nonstandard_headings():
    ex = quality_extraction()
    ex.section_headers = ["Experience", "My Journey", "Where I've Been"]
    layout = LayoutReport(issues=[LayoutIssue("Multi-column or table layout", "x")])
    result = scoring.score_structure(ex, "jane@example.com linkedin.com/in/jane", layout)
    assert result["score"]["pointsAwarded"] == 30 - 3
    issues = [i["issue"] for i in result["analysis"]["atsIssues"]]
    assert issues.count("Non-standard section heading") == 2 and "Multi-column or table layout" in issues
    assert all(i["points"] == -1 for i in result["analysis"]["atsIssues"])


def test_ats_penalty_is_capped_at_40_percent_of_the_component():
    ex = quality_extraction()
    ex.section_headers = [f"Odd heading number {i}" for i in range(40)]
    result = scoring.score_structure(ex, "jane@example.com linkedin.com/in/jane", LayoutReport())
    assert result["score"]["atsPenalty"] == 12 and result["score"]["pointsAwarded"] == 18


def test_structure_never_goes_below_zero():
    ex = quality_extraction()
    for name in ("personal_information", "links", "work_experience", "education"):
        setattr(ex.sections, name, False)
    ex.section_headers = [f"Odd {i}" for i in range(40)]
    assert scoring.score_structure(ex, "no contact", LayoutReport())["score"]["pointsAwarded"] == 0


# ------------------------------------------------------------------ negative caps (spec section 5)
def roles(strong, partial, misaligned):
    return (
        [RoleAssessment(role=f"s{i}", fit="strong", notes="") for i in range(strong)]
        + [RoleAssessment(role=f"p{i}", fit="partial", notes="") for i in range(partial)]
        + [RoleAssessment(role=f"m{i}", fit="misaligned", notes="") for i in range(misaligned)]
    )


def test_experience_negatives_cannot_remove_more_than_40_percent():
    ex = fit_extraction()
    ex.roles = roles(strong=1, partial=0, misaligned=10)
    # expected_max = 3; raw positive 3 -> 30 points; negatives capped at 12 points, not 100
    assert scoring.score_experience(ex)["score"]["pointsAwarded"] == 18.0


def test_experience_without_misaligned_roles_is_unchanged_by_the_cap():
    ex = fit_extraction()
    ex.roles = roles(strong=2, partial=0, misaligned=0)
    assert scoring.score_experience(ex)["score"]["pointsAwarded"] == 30
    ex.roles = roles(strong=2, partial=0, misaligned=1)  # raw 5 / expected 6 -> 25, well inside the cap
    assert scoring.score_experience(ex)["score"]["pointsAwarded"] == 25


def test_skills_missing_penalty_is_capped_at_40_percent():
    ex = fit_extraction()
    ex.hard_skills = [type(ex.hard_skills[0])(skill=f"h{i}", also_in_experience=False) for i in range(10)]  # +10
    ex.soft_skills = []
    ex.missing_skills = [MissingSkill(skill=f"m{i}", skill_type="hard") for i in range(20)]
    # without the cap this would be 0; the cap limits the loss to 6 of the 15 points
    assert scoring.score_skills(ex)["score"]["pointsAwarded"] == 4.0
