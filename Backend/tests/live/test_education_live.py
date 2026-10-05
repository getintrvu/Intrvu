"""Live check of how the model maps degree names to levels. Needs a real Gemini key and uses quota:

    .venv/Scripts/python -m pytest -m live tests/live

Skipped by default. Re-run it after any change to the prompts or LLM_MODEL.
"""
import asyncio

import pytest
from dotenv import dotenv_values

from app.config import Settings
from app.llm import prompts
from app.llm.client import GeminiLLM
from app.llm.models import JobFitExtraction

pytestmark = pytest.mark.live

JOB = (
    "We need an engineer with a B.E./B.Tech in Computer Science or equivalent. " * 3
    + "Strong Python and SQL skills required. Responsibilities include building APIs."
)
BASE = "Asha Rao\nasha@example.com\nSoftware Engineer, Infosys, 2020-2024. Built Python APIs and SQL reports.\nSkills: Python, SQL\n"

CASES = [
    ("EDUCATION\nB.Tech in Computer Science and Engineering, VIT University, 2020", "bachelor"),
    ("EDUCATION\nB.E. in Electronics, Anna University, 2019", "bachelor"),
    ("EDUCATION\nBachelor of Technology, Information Technology, JNTU, 2018", "bachelor"),
    ("EDUCATION\nBE (Hons) Mechanical Engineering, BITS Pilani, 2018", "bachelor"),
    ("EDUCATION\nBCA, Delhi University, 2017", "bachelor"),
    ("EDUCATION\nB.Com, Mumbai University, 2018", "bachelor"),
    ("EDUCATION\nM.Sc. Computer Science, IIT Bombay, 2021\nB.Sc. Mathematics, Pune University, 2019", "master"),
    ("EDUCATION\nM.Tech in Data Science, IIT Madras, 2022", "master"),
    ("EDUCATION\nMBA, ISB Hyderabad, 2021", "master"),
    ("EDUCATION\nPh.D. in Machine Learning, IISc, 2023", "doctorate"),
    ("EDUCATION\nDiploma in Computer Engineering, Government Polytechnic, 2016", "associate_or_diploma"),
    ("EDUCATION\nHigher Secondary (12th), CBSE, 2015", "associate_or_diploma"),
    ("", "none"),
]


@pytest.fixture
def llm():
    key = dotenv_values(".env").get("GEMINI_API_KEY")
    if not key:
        pytest.skip("GEMINI_API_KEY is not set in Backend/.env")
    return GeminiLLM(Settings(gemini_api_key=key, llm_max_attempts=4))


@pytest.mark.parametrize("education,expected", CASES, ids=[c[0].split("\n")[-1][:40] or "no education" for c in CASES])
async def test_degree_is_mapped_to_the_right_level(llm, education, expected):
    await asyncio.sleep(2)  # stay inside free-tier rate limits
    result = await llm.extract(JobFitExtraction, prompts.SYSTEM, prompts.job_fit_prompt(BASE + education, JOB))
    assert result.degree.level == expected, result.degree


async def test_unfinished_degree_is_labelled(llm):
    education = "EDUCATION\nB.Tech in Computer Science, SRM University, expected 2026 (pursuing)"
    result = await llm.extract(JobFitExtraction, prompts.SYSTEM, prompts.job_fit_prompt(BASE + education, JOB))
    assert "in progress" in result.degree.degree_found.lower()
