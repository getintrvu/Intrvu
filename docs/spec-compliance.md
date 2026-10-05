# Scoring spec v4: compliance audit

Audited against [`scoring-spec-v4.md`](scoring-spec-v4.md) and the code in `Backend/app/scoring.py`, `Backend/app/llm/prompts.py` and the extension UI. Status: **OK** follows the spec, **Partial** follows it with an approximation or a gap, **Missing** not implemented, **Conflict** does something the spec forbids.

## Summary

| # | Spec section | Status |
|---|---|---|
| 1 | Goal: deterministic, consistent | **Partial**: arithmetic is deterministic, but the evidence the model extracts varies (measured 58.7-77.2 on identical input without a seed) |
| 2 | Two independent dimensions | OK |
| 3 | Adaptive context (career stage, industry) | **Missing** |
| 4 | Job Fit labels | OK (label/percentage mismatch at .5 boundaries **fixed**) |
| 5 | Component maxima and total | OK |
| 5 | Negative-adjustment cap (40% per component) | OK: keywords, experience and skills (**fixed**) |
| 6 | Keyword match: embeddings, cosine thresholds | **Partial**: LLM judgement instead of cosine similarity |
| 6.4 | Keyword stuffing (> 3 per 100 words) | **Partial**: decided by the model, not measured |
| 7 | Experience alignment and normalization | OK, except the negative cap |
| 8 | Education gate | **Partial**, and **Conflict** with hard rule 17 when the job asks for no degree |
| 9 | Skills (+1 / +0.5 / -1, de-dup, cap) | OK, except importance weighting and the negative cap |
| 10 | Resume Quality shown as a label only | OK (**fixed**): tier and tip only |
| 12 | Resume Structure | **Partial**: ATS penalties added (**fixed**); conditional certifications still missing |
| 12.4 | No user-facing structure rating | OK (**fixed**) |
| 13 | Action words | OK (model classifies; no fixed lexicon in code) |
| 14 | Measurable results | OK |
| 15 | Bullet effectiveness | OK |
| 16 | Certification handling | **Missing** |
| 17 | Hard rules | One **Conflict** (see 8), the rest OK |
| App. B | Degree equivalency, configurable and region-aware | **Partial** |
| App. C | ATS formatting rules | **Partial** (**added**): column/table layouts, many images, non-standard headings. Not detectable: text inside images, tables drawn as lines |
| App. D | Semantic matching must be stable | **Partial**: not stable (see 6) |

## Details

### 1 and App. D: consistency
Every score is computed in code from fixed rules, but the *evidence* (which keywords are strong, partial or missing, which roles count) comes from an LLM. A fixed sampling seed makes repeated runs of the same input identical, but a one-line change to the resume can move the result a lot. The spec's own goals ("ensure consistency", "stable cosine similarity distributions") are not met until keyword matching is mechanical (see 6).

### 3: adaptive context
Career stage (<2, 2-8, >8 years or leadership indicators) and industry-based weight emphasis are not implemented. The spec says they change "internal weight emphasis only" without saying how, so the effect is undefined. The pre-rebuild code detected stage and industry but never applied weights, so this was never working either.

### 5: negative-adjustment guardrail (fixed)
Now applied to keywords (14 of 35), experience (12 of 30, applied inside the spec's normalization formula) and skills (6 of 15). Resume Quality components have no stated cap other than App. C's "category penalty caps", which is applied to the structure ATS penalty (12 of 30). The rest of this section is the original finding.

"Negative adjustments within any single component are capped at 40% of that component's maximum." Implemented for keywords (14 of 35). Not implemented for experience (12 of 30, applied after normalization) or skills (6 of 15). For Resume Quality the spec only mentions caps in App. C.

### 6: keyword and contextual match
The spec asks for embeddings, cosine similarity, a 0.80 / 0.65 threshold, and (App. D) allows "hybrid keyword systems, or equivalent techniques, provided behavioral thresholds are met". We ask the model to label each term strong or partial; there is no similarity value and no threshold. Which terms are "critical" is also the model's decision each time.

Stuffing (6.4) is reported by the model. It should be counted in code: occurrences of each matched keyword per 100 words of the resume, penalty when above 3.

### 8 and rule 17: education
- The 20 points are awarded or withheld whether or not the job mentions a degree. Rule 17 says "No penalty unless explicitly required by job", so a job with no degree requirement should not cost 20 points.
- 8.4: "Field of study is ignored unless explicitly required by the job." We always ignore it.
- App. B lists a **4-year diploma (India)** as bachelor-equivalent. The prompt treats all diplomas, including polytechnic ones, as not meeting the gate.
- Degree mapping lives in the prompt text, not in configurable, region-aware data.

### 10 and 12.4: what the UI shows (fixed)
The results card now shows Resume Quality as a tier plus tip with no number or bar, and the Structure tab lists which sections are included and any formatting issues, with no rating or percentages. The rest of this section is the original finding.

The spec says the Resume Quality number "must not be exposed in UI" and that no structure rating is displayed. The results card shows "42%" with a progress bar for Resume Quality, and the Structure tab shows section percentages. (The API returns the numbers; the spec calls the score "internal", so only the UI is the problem.)

### 12 and App. C: structure (ATS checks added)
Added in `Backend/app/layout.py`: a multi-column / table check (pypdf layout mode: lines with two substantial blocks side by side; right-aligned dates do not count), an excessive-images check (3 or more embedded images), and non-standard section headings (the model lists headings, code compares them with a list of standard ones). Each issue is -1, capped at 12 of the 30 points. Known limits: it cannot see text drawn inside an image or tables built from drawn lines, and a skills list laid out in wide columns can look like a column layout. The rest of this section is the original finding.

Only the four required sections are scored (7.5 each). Missing: the -1 ATS penalties (multi-column layouts, tables, text in images, non-standard section headers, excessive icons) and the rule that certifications are required only when the job requires them. Because nothing can lower this component, it is 30/30 for almost every resume, which inflates the Resume Quality score. Detecting layout needs more than the extracted text (word positions for columns, image counts per page), plus a list of headings from the model for the non-standard-header check.

### 16: certifications
Not implemented. The spec defines the behaviour (ignore when not mentioned; required = binary pass/fail; preferred = additive boost; normalize aliases) but gives no point values, so they need to be decided.

### What was checked and is fine
Component maxima (35 / 30 / 20 / 15 and 30 / 25 / 25 / 20); keyword weights (+2 / +1 / -1 / -2), positive cap before penalties and floor at 0; experience weights (+3 / +1.5 / -1), `expected_max = min(relevant x 3, 12)` and the normalization to 30; skills weights, de-duplication to 50% and the 15 cap; action-word, measurable-result and bullet weights; the two independent dimensions (the quality call never sees the job posting); total capped at 100; every item shown to the user is evidence-backed and explainable.

## Fixed during this audit
- A total such as 89.5 displayed "90%" but carried the "Good Match" label for 89 (and 74.5 displayed 75% as "Moderate Match"). The label is now chosen from the displayed number, rounded half up.
