import os

# Must be set before app modules read settings.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("AUTH_REQUIRED", "true")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret-test-secret-test-secret-123")
os.environ.setdefault("DAILY_QUOTA", "3")

import time

import jwt
import pytest
from fastapi.testclient import TestClient

from app.auth import get_verifier
from app.config import get_settings
from app.errors import AppError
from app.llm.factory import get_llm_factory
from app.llm.models import (
    BulletReview, Cliche, DegreeEvidence, JobFitExtraction, KeywordHit, MetricOpportunity,
    MissingSkill, QualityExtraction, QuantifiedBullet, RoleAssessment, SectionsPresent,
    SkillHit, StrongVerbUse, WeakVerbUse,
)
from app.main import create_app
from app.quota import QuotaStatus, get_user_data_service, get_quota_service

SECRET = os.environ["SUPABASE_JWT_SECRET"]
USER_ID = "11111111-1111-1111-1111-111111111111"


def make_token(sub: str = USER_ID, *, exp_in: int = 3600, aud: str = "authenticated", secret: str = SECRET) -> str:
    claims = {
        "sub": sub, "aud": aud, "email": "u@example.com", "exp": int(time.time()) + exp_in,
        "iss": "https://example.supabase.co/auth/v1",
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def make_pdf(text: str) -> bytes:
    """Build a tiny single-page text PDF (enough for pypdf to extract text from)."""
    lines = [text[i : i + 80] for i in range(0, len(text), 80)]
    stream = "BT /F1 10 Tf 12 TL 40 760 Td " + " T* ".join(f"({l.replace('(', '[').replace(')', ']')}) Tj" for l in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


RESUME_TEXT = (
    "Jane Doe jane.doe@example.com +1 555 123 4567 linkedin.com/in/janedoe "
    "Senior Engineer at Acme 2019-2024. Led a team of 6 engineers and built a payments platform "
    "that cut processing time by 40 percent. Bachelor of Science in Computer Science, State University. "
    "Skills: Python, SQL, AWS, leadership."
)
JOB_DESCRIPTION = "We are hiring a senior Python engineer to build scalable payment systems on AWS. " * 3


def fit_extraction() -> JobFitExtraction:
    return JobFitExtraction(
        strong_keywords=[KeywordHit(keyword="Python", evidence="Python")] * 5,
        partial_keywords=[KeywordHit(keyword="Kubernetes", evidence="Docker")] * 2,
        missing_keywords=["Terraform"],
        stuffed_keywords=[],
        keyword_advice="Add Terraform.",
        roles=[RoleAssessment(role="Senior Engineer", fit="strong", notes="Same function")],
        experience_advice="Good.",
        degree=DegreeEvidence(degree_found="BSc Computer Science", level="bachelor", field_of_study="Computer Science"),
        education_advice="",
        hard_skills=[SkillHit(skill="Python", also_in_experience=True), SkillHit(skill="AWS", also_in_experience=False)],
        soft_skills=[SkillHit(skill="Leadership", also_in_experience=False)],
        missing_skills=[MissingSkill(skill="Terraform", skill_type="hard")],
        skills_advice="Add Terraform.",
    )


def quality_extraction() -> QualityExtraction:
    return QualityExtraction(
        sections=SectionsPresent(
            personal_information=True, links=True, work_experience=True, education=True,
            professional_summary=False, skills=True, certifications=False, projects=False,
            awards=False, volunteering=False, publications=False,
        ),
        section_headers=["Experience", "Education", "Skills"],
        structure_advice="Add a summary.",
        strong_verbs=[StrongVerbUse(bullet="Led a team of 6 engineers", verb="Led")] * 4,
        weak_verbs=[WeakVerbUse(bullet="Helped with deploys", verb="Helped", suggested_replacement="Automated")],
        cliches=[Cliche(phrase="team player", suggested_replacement="Name the team outcome")],
        action_words_advice="Vary verbs.",
        quantified_bullets=[QuantifiedBullet(bullet="Cut processing time by 40 percent", metric="40%")] * 2,
        metric_opportunities=[MetricOpportunity(bullet="Improved reliability", suggestion="Add uptime")],
        outcome_language_count=1,
        measurable_advice="Add numbers.",
        bullets=[
            BulletReview(
                bullet="Built a payments platform that cut processing time by 40 percent for merchants",
                well_structured=True, strengths="Clear impact", issues="", suggested_revision="",
            ),
            BulletReview(bullet="Worked on stuff", well_structured=False, strengths="", issues="Vague.", suggested_revision="Be specific."),
        ],
        bullets_advice="Tighten bullets.",
    )


class FakeLLM:
    provider = "fake"
    model = "fake-model"
    byok = False

    def __init__(self, fail: Exception | None = None):
        self.fail = fail
        self.calls = 0

    async def extract(self, schema, system, prompt):
        self.calls += 1
        if self.fail:
            raise self.fail
        return fit_extraction() if schema is JobFitExtraction else quality_extraction()


class FakeQuota:
    def __init__(self, allowed: bool = True):
        self.allowed, self.consumed, self.released = allowed, 0, 0

    async def consume(self, user_id):
        self.consumed += 1
        return QuotaStatus(self.allowed, 3 if not self.allowed else self.consumed, 3)

    async def release(self, user_id):
        self.released += 1

    async def status(self, user_id):
        return QuotaStatus(True, 1, 3)


class FakeUserData:
    def __init__(self):
        self.deleted: list[str] = []

    async def delete(self, user_id):
        self.deleted.append(user_id)


@pytest.fixture
def user_data():
    return FakeUserData()


@pytest.fixture
def llm():
    return FakeLLM()


@pytest.fixture
def quota():
    return FakeQuota()


@pytest.fixture
def client(llm, quota, user_data):
    get_settings.cache_clear()
    get_verifier.cache_clear()
    app = create_app()
    # The factory is what picks the server LLM or one built from the user's own key. Tests record
    # what it was asked for and always hand back the fake.
    llm.requested = []

    def factory(settings, byok):
        llm.requested.append(byok)
        llm.byok = byok is not None
        return llm

    app.dependency_overrides[get_llm_factory] = lambda: factory
    app.dependency_overrides[get_quota_service] = lambda: quota
    app.dependency_overrides[get_user_data_service] = lambda: user_data
    return TestClient(app)


@pytest.fixture
def auth():
    return {"Authorization": f"Bearer {make_token()}"}


def make_positioned_pdf(items: list[tuple[float, float, str]], pages: int = 1) -> bytes:
    """A PDF with each text item drawn at (x, y) on a 612x792 page. Used to build layouts."""
    def esc(t):
        return t.replace("\\", "\\\\").replace("(", "[").replace(")", "]")

    stream = "BT /F1 10 Tf " + " ".join(f"1 0 0 1 {x} {y} Tm ({esc(t)}) Tj" for x, y, t in items) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [" + " ".join(f"{3 + i * 2} 0 R" for i in range(pages)) + f"] /Count {pages} >>",
    ]
    for i in range(pages):
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {4 + i * 2} 0 R /Resources << /Font << /F1 {3 + pages * 2} 0 R >> >> >>")
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
    objs.append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out
