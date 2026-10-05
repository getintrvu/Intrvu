"""Education gate (spec 8) applied only when the job asks for it (spec hard rule 17)."""
import pytest

from app import scoring
from app.llm.models import DegreeEvidence
from tests.conftest import fit_extraction


def case(level, found="X", field="", required=True, required_field="", field_matches=True):
    ex = fit_extraction()
    ex.degree = DegreeEvidence(degree_found=found, level=level, field_of_study=field)
    ex.degree_required = required
    ex.required_field = required_field
    ex.field_matches_requirement = field_matches
    return scoring.score_education(ex)


def points(result):
    return result["score"]["pointsAwarded"]


# ------------------------------------------------------------------ the job asks for no degree
@pytest.mark.parametrize("level", ["none", "associate_or_diploma", "bachelor", "master", "doctorate"])
def test_job_without_a_degree_requirement_awards_the_20_points_to_everyone(level):
    result = case(level, required=False)
    assert points(result) == 20 and result["score"]["passed"] is True
    assert result["analysis"]["status"] == "Not required"
    assert result["score"]["rating"] == "No degree required"
    assert "no education penalty" in result["analysis"]["suggestedImprovements"]


def test_field_is_ignored_when_the_job_requires_no_degree():
    assert points(case("none", required=False, required_field="Computer Science", field_matches=False)) == 20


# ------------------------------------------------------------------ the job asks for a degree
@pytest.mark.parametrize("level,expected", [("bachelor", 20), ("master", 20), ("doctorate", 20), ("associate_or_diploma", 0), ("none", 0)])
def test_required_degree_is_a_binary_gate_at_bachelor_level(level, expected):
    result = case(level, found="Some degree")
    assert points(result) == expected and result["score"]["passed"] is (expected == 20)
    assert result["analysis"]["status"] == ("Pass" if expected else "Fail")


def test_failing_the_gate_explains_what_to_do():
    result = case("associate_or_diploma", found="Diploma")
    assert "Bachelor" in result["analysis"]["suggestedImprovements"]


# ------------------------------------------------------------------ explicitly required field (spec 8.4)
def test_field_only_matters_when_the_job_names_one():
    assert points(case("bachelor", field="Commerce", required_field="", field_matches=False)) == 20


def test_a_required_field_that_does_not_match_fails_the_gate_with_a_clear_reason():
    result = case("bachelor", found="B.Com", field="Commerce", required_field="Computer Science", field_matches=False)
    assert points(result) == 0 and result["score"]["passed"] is False
    assert "Computer Science" in result["analysis"]["suggestedImprovements"]
    assert "Commerce" in result["analysis"]["suggestedImprovements"]


def test_a_required_field_that_matches_passes():
    assert points(case("bachelor", field="Software Engineering", required_field="Computer Science", field_matches=True)) == 20


def test_response_reports_what_the_job_asked_for():
    result = case("bachelor", required_field="Computer Science")
    assert result["analysis"]["required"] is True and result["analysis"]["requiredField"] == "Computer Science"
    assert case("none", required=False)["analysis"]["required"] is False
