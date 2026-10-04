from app import scoring
from app.llm.models import BulletReview, DegreeEvidence, RoleAssessment, StuffedKeyword
from tests.conftest import fit_extraction, quality_extraction


def test_keyword_score_applies_weights_and_penalty_cap():
    ex = fit_extraction()  # 5 strong, 2 partial, 1 missing
    result = scoring.score_keywords(ex)
    assert result["score"]["pointsAwarded"] == 2 * 5 + 2 - 1
    assert result["score"]["maxPoints"] == 35

    ex.missing_keywords = [f"k{i}" for i in range(30)]
    ex.stuffed_keywords = [StuffedKeyword(keyword="x", occurrences=9)] * 10
    # penalties are capped at 14 points, and the score never goes below 0
    assert scoring.score_keywords(ex)["score"]["pointsAwarded"] == 0


def test_keyword_positive_points_capped_at_35():
    ex = fit_extraction()
    ex.strong_keywords = ex.strong_keywords * 10  # 50 strong -> 100 raw points
    ex.missing_keywords, ex.stuffed_keywords = [], []
    assert scoring.score_keywords(ex)["score"]["pointsAwarded"] == 35


def test_experience_normalization():
    ex = fit_extraction()
    ex.roles = [RoleAssessment(role=f"r{i}", fit="strong", notes="") for i in range(2)]
    # raw 6, expected_max min(2*3, 12)=6 -> 30
    assert scoring.score_experience(ex)["score"]["pointsAwarded"] == 30

    ex.roles = [RoleAssessment(role="a", fit="partial", notes=""), RoleAssessment(role="b", fit="misaligned", notes="")]
    result = scoring.score_experience(ex)  # raw 0.5, expected 3 -> 5.0
    assert result["score"]["pointsAwarded"] == 5.0
    assert result["score"]["numberOfRelevantRoles"] == 1

    ex.roles = [RoleAssessment(role="a", fit="misaligned", notes="")]
    assert scoring.score_experience(ex)["score"]["pointsAwarded"] == 0  # floored


def test_education_is_a_binary_gate():
    ex = fit_extraction()
    assert scoring.score_education(ex)["score"]["pointsAwarded"] == 20
    for level, expected in [("master", 20), ("doctorate", 20), ("associate_or_diploma", 0), ("none", 0)]:
        ex.degree = DegreeEvidence(degree_found="x", level=level, field_of_study="")
        result = scoring.score_education(ex)
        assert result["score"]["pointsAwarded"] == expected
        assert result["score"]["passed"] is (expected == 20)


def test_skills_deduplication_and_missing():
    result = scoring.score_skills(fit_extraction())
    # Python 0.5 (deduped) + AWS 1 + leadership 0.5 - 1 missing
    assert result["score"]["pointsAwarded"] == 1.0
    assert len(result["analysis"]["doubleCountReductions"]) == 1
    assert result["analysis"]["hardSkillMatches"][0]["deduplicationApplied"] is True


def test_structure_uses_regex_fallbacks_for_contact_and_links():
    ex = quality_extraction()
    ex.sections.personal_information = False
    ex.sections.links = False
    text = "Reach me at jane@example.com or https://janedoe.dev"
    result = scoring.score_structure(ex, text)
    assert result["score"]["pointsAwarded"] == 30
    assert result["analysis"]["missingRequiredSections"] == []

    result = scoring.score_structure(ex, "no contact info at all")
    assert result["score"]["pointsAwarded"] == 15  # work experience + education only
    assert "Personal Information" in result["analysis"]["missingRequiredSections"]


def test_action_words_score():
    result = scoring.score_action_words(quality_extraction())  # 4 strong, 1 weak, 1 cliche
    assert result["score"]["pointsAwarded"] == 4 - 0.5 - 1


def test_measurable_results_partial_credit_is_capped():
    ex = quality_extraction()  # 2 quantified, 1 outcome-only
    assert scoring.score_measurable(ex)["score"]["pointsAwarded"] == 5.5
    ex.outcome_language_count = 10
    assert scoring.score_measurable(ex)["score"]["pointsAwarded"] == 6.0  # +1 max
    ex.quantified_bullets = ex.quantified_bullets * 10
    assert scoring.score_measurable(ex)["score"]["pointsAwarded"] == 25


def test_bullet_effectiveness_measures_length_in_code():
    ex = quality_extraction()
    long_enough = "Built a payments platform that cut processing time by 40 percent for merchants"
    ex.bullets = [
        BulletReview(bullet=long_enough, well_structured=True, strengths="s", issues="", suggested_revision=""),
        # model says well structured, but it is only 3 words: still ineffective
        BulletReview(bullet="Led the team", well_structured=True, strengths="", issues="", suggested_revision="x"),
    ]
    result = scoring.score_bullets(ex)
    assert len(result["analysis"]["effectiveBullets"]) == 1
    assert len(result["analysis"]["ineffectiveBullets"]) == 1
    assert "12-20 words" in result["analysis"]["ineffectiveBullets"][0]["issues"]
    assert result["score"]["pointsAwarded"] == 1.5
    assert result["analysis"]["effectiveBullets"][0]["wordCount"] == len(long_enough.split())


def test_only_first_ten_bullets_are_scored():
    ex = quality_extraction()
    good = "Built a payments platform that cut processing time by 40 percent for merchants"
    ex.bullets = [BulletReview(bullet=good, well_structured=True, strengths="", issues="", suggested_revision="")] * 15
    assert scoring.score_bullets(ex)["score"]["pointsAwarded"] == 20


def test_labels():
    assert scoring.overall(95, scoring.JOB_FIT_LABELS)["label"] == "Great Match"
    assert scoring.overall(75, scoring.JOB_FIT_LABELS)["label"] == "Good Match"
    assert scoring.overall(60, scoring.JOB_FIT_LABELS)["label"] == "Moderate Match"
    assert scoring.overall(59.9, scoring.JOB_FIT_LABELS)["label"] == "Low Fit"
    assert scoring.overall(90, scoring.QUALITY_LABELS)["label"] == "Ready to Impress"
    assert scoring.overall(70, scoring.QUALITY_LABELS)["label"] == "Needs Polish"
    assert scoring.overall(10, scoring.QUALITY_LABELS)["label"] == "Refine for Impact"


def test_scores_never_exceed_maximums():
    ex = fit_extraction()
    ex.strong_keywords = ex.strong_keywords * 50
    parts = [scoring.score_keywords(ex), scoring.score_experience(ex), scoring.score_education(ex), scoring.score_skills(ex)]
    assert scoring.total_points(*parts) <= 100
