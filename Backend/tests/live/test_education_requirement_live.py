"""Live checks for Canadian degree names and for reading what the posting asks for.

    .venv/Scripts/python -m pytest -m live tests/live/test_education_requirement_live.py

Needs GEMINI_API_KEY in Backend/.env and uses quota. Skipped by default.
"""
import asyncio

import pytest
from dotenv import dotenv_values

from app.config import Settings
from app.llm import prompts
from app.llm.client import GeminiLLM
from app.llm.models import JobFitExtraction

pytestmark = pytest.mark.live

BODY = "Responsibilities include building and maintaining Python services and SQL reports. Strong Python and SQL skills are required. "
BASE = "Alex Tremblay\nalex@example.com\nSoftware Developer, Shopify, 2020-2024. Built Python services and SQL reports.\nSkills: Python, SQL\n"

CANADIAN_LEVELS = [
    ("Honours Bachelor of Science, Western University, 2019", "bachelor"),
    ("Bachelor of Applied Science (B.A.Sc.), University of Toronto, 2020", "bachelor"),
    ("B.Eng., McGill University, 2018", "bachelor"),
    ("B.Comm., University of British Columbia, 2017", "bachelor"),
    ("Baccalauréat en informatique, Université de Montréal, 2018", "bachelor"),
    ("Bachelor of Technology (BTech), Seneca College, 2021", "bachelor"),
    ("Post-graduate Certificate in Data Analytics, Humber College, 2022", "bachelor"),
    ("Education evaluated by WES as equivalent to a Canadian Bachelor's degree (B.Tech, India), 2016", "bachelor"),
    ("Maîtrise en sciences, Université Laval, 2021", "master"),
    ("M.A.Sc., University of Waterloo, 2022", "master"),
    ("Advanced Diploma, Computer Programmer Analyst, Seneca College, 2019", "associate_or_diploma"),
    ("DEC en techniques de l'informatique, Cégep de Maisonneuve, 2016", "associate_or_diploma"),
    ("Ontario Secondary School Diploma (OSSD), 2015", "associate_or_diploma"),
    ("Red Seal Certificate, Electrician, 2018", "associate_or_diploma"),
]

JOBS_BY_REQUIREMENT = [
    ("says nothing about education", BODY * 2, False),
    ("a degree is only an asset", BODY * 2 + "A Bachelor's degree is an asset.", False),
    ("a degree is required", BODY * 2 + "Bachelor's degree in Computer Science or a related field required.", True),
    ("degree or equivalent", BODY * 2 + "Bachelor's degree or equivalent.", True),
]


@pytest.fixture
def llm():
    key = dotenv_values(".env").get("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY is not set in Backend/.env")
    return GeminiLLM(Settings(gemini_api_key=key, llm_max_attempts=4))


async def extract(llm, resume_education: str, job: str) -> JobFitExtraction:
    await asyncio.sleep(2)  # stay inside free-tier rate limits
    resume = BASE + "EDUCATION\n" + resume_education
    return await llm.extract(JobFitExtraction, prompts.SYSTEM, prompts.job_fit_prompt(resume, job))


@pytest.mark.parametrize("education,expected", CANADIAN_LEVELS, ids=[c[0][:45] for c in CANADIAN_LEVELS])
async def test_canadian_credentials_are_mapped_to_the_right_level(llm, education, expected):
    ex = await extract(llm, education, BODY * 2 + "Bachelor's degree required.")
    assert ex.degree.level == expected, ex.degree


@pytest.mark.parametrize("label,job,expected", JOBS_BY_REQUIREMENT, ids=[j[0] for j in JOBS_BY_REQUIREMENT])
async def test_the_postings_degree_requirement_is_read_correctly(llm, label, job, expected):
    ex = await extract(llm, "B.Sc. in Computer Science, University of Toronto, 2019", job)
    assert ex.degree_required is expected, (label, ex.degree_required)


async def test_a_named_field_is_extracted_and_checked(llm):
    job = BODY * 2 + "Bachelor's degree in Computer Science or a related field required."
    related = await extract(llm, "B.Eng. in Software Engineering, University of Waterloo, 2019", job)
    assert "computer" in related.required_field.lower()
    assert related.field_matches_requirement is True

    unrelated = await extract(llm, "B.Comm. in Marketing, University of British Columbia, 2019", job)
    assert unrelated.field_matches_requirement is False


async def test_no_named_field_means_no_field_requirement(llm):
    ex = await extract(llm, "B.Comm. in Marketing, University of British Columbia, 2019", BODY * 2 + "Bachelor's degree required.")
    assert ex.required_field.strip() == ""
    assert ex.field_matches_requirement is True
