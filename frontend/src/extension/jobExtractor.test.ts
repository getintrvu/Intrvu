import fixture from './__fixtures__/linkedin-job.html?raw';
import { expandJobDescription, extractCompanyName, extractJob, extractJobTitle, findJobDescriptionSection } from './jobExtractor';
import { isJobPostingUrl, isLinkedInJobUrl } from './constants';

function load(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('job extraction from a saved LinkedIn page', () => {
  const doc = load(fixture);

  it('finds the title and company', () => {
    expect(extractJobTitle(doc)).toBe('Python Trainer');
    expect(extractCompanyName(doc)).toContain('ExcelPTP');
  });

  it('finds the description container', () => {
    const section = findJobDescriptionSection(doc);
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('python developer');
  });

  it('returns a usable job', () => {
    const job = extractJob(doc);
    expect(job).not.toBeNull();
    expect(job!.jobDescription.length).toBeGreaterThan(120);
    expect(job!.jobDescription).toContain('Remuneration');
    expect(job!.jobDescription).not.toMatch(/\n{3,}/);
  });

  it('returns null when the page has no description yet', () => {
    const empty = load('<html><body><h1>Python Trainer</h1><p>Loading</p></body></html>');
    expect(extractJob(empty)).toBeNull();
  });

  it('strips buttons and premium upsells from the description', () => {
    const body = 'Responsibilities include building services and requirements for experience. '.repeat(4);
    const page = load(
      `<html><body><div class="jobs-description__content"><p>${body}</p>` +
        '<button>Show more</button><a href="/premium">Try Premium for free</a></div></body></html>',
    );
    const job = extractJob(page);
    expect(job!.jobDescription).not.toContain('Show more');
    expect(job!.jobDescription).not.toContain('Try Premium');
  });
});

describe('isLinkedInJobUrl', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/123/', true],
    ['https://www.linkedin.com/jobs/search/?keywords=python', true],
    ['https://www.linkedin.com/jobs/collections/recommended/', true],
    ['https://www.linkedin.com/company/acme/jobs/', true],
    ['https://www.linkedin.com/feed/', false],
    ['https://www.linkedin.com/in/someone/', false],
    ['https://example.com/jobs/view/1', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isLinkedInJobUrl(url)).toBe(expected);
  });
});

describe('isJobPostingUrl (auto-open only on a specific posting)', () => {
  it.each([
    ['https://www.linkedin.com/jobs/view/4139507733/', true],
    ['https://www.linkedin.com/jobs/view/4139507733/?trackingId=x', true],
    ['https://www.linkedin.com/jobs/search/?keywords=python', false],
    ['https://www.linkedin.com/jobs/search/?currentJobId=4139507733', false],
    ['https://www.linkedin.com/jobs/collections/recommended/', false],
    ['https://www.linkedin.com/jobs/', false],
    ['https://www.linkedin.com/company/acme/jobs/', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isJobPostingUrl(url)).toBe(expected);
  });
});

// ---------------------------------------------------------------- title / company robustness
const DESCRIPTION = `<div class="jobs-description__content"><p>${'Responsibilities include building services; requirements include experience with Python and SQL. '.repeat(4)}</p></div>`;

const page = (body: string, head = '') => new DOMParser().parseFromString(`<html><head>${head}</head><body>${body}</body></html>`, 'text/html');

describe('title and company are not confused with page chrome', () => {
  it('ignores the hidden "0 notifications total" heading (the reported bug)', () => {
    const doc = page(`
      <header><h1 class="visually-hidden">0 notifications total</h1></header>
      <h1 class="a11y-text">0 notifications total</h1>
      <main>
        <div class="job-details-jobs-unified-top-card__container">
          <h1 class="t-24"><a href="/jobs/view/123/">Senior Data Analyst</a></h1>
          <div class="job-details-jobs-unified-top-card__company-name"><a href="/company/nielseniq/">NielsenIQ</a></div>
        </div>
        ${DESCRIPTION}
      </main>`);
    const job = extractJob(doc)!;
    expect(job.jobTitle).toBe('Senior Data Analyst');
    expect(job.company).toBe('NielsenIQ');
  });

  it('skips a bare notifications heading even without a surrounding header', () => {
    const doc = page(`<h1>0 notifications total</h1><h1>Platform Engineer</h1>${DESCRIPTION}`);
    expect(extractJobTitle(doc)).toBe('Platform Engineer');
  });

  it('prefers schema.org JobPosting data when present', () => {
    const ld = JSON.stringify({ '@type': 'JobPosting', title: 'Staff Engineer', hiringOrganization: { name: 'Acme Corp' } });
    const doc = page(`<h1>Something else entirely</h1>${DESCRIPTION}`, `<script type="application/ld+json">${ld}</script>`);
    const job = extractJob(doc)!;
    expect(job.jobTitle).toBe('Staff Engineer');
    expect(job.company).toBe('Acme Corp');
  });

  it('reads JobPosting data inside an @graph and survives malformed JSON-LD', () => {
    const graph = JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, { '@type': 'JobPosting', title: 'QA Lead' }] });
    const doc = page(DESCRIPTION, `<script type="application/ld+json">{broken</script><script type="application/ld+json">${graph}</script>`);
    expect(extractJobTitle(doc)).toBe('QA Lead');
  });

  it('falls back to the browser tab title', () => {
    const doc = page(DESCRIPTION, '<title>(3) Product Manager | Globex | LinkedIn</title>');
    const job = extractJob(doc)!;
    expect(job.jobTitle).toBe('Product Manager');
    expect(job.company).toBe('Globex');
  });

  it('does not take the company from navigation or sidebar suggestions', () => {
    const doc = page(`
      <nav><a href="/company/linkedin/">LinkedIn Premium</a></nav>
      <aside><a href="/company/other-co/">Other Co</a></aside>
      <div class="jobs-unified-top-card"><a href="/company/real-co/">Real Co</a></div>
      ${DESCRIPTION}`);
    expect(extractCompanyName(doc)).toBe('Real Co');
  });

  it('keeps legitimate titles that merely contain "noisy" words or start with a digit', () => {
    for (const title of ['3D Artist', 'Premium Support Engineer', 'LinkedIn Ads Specialist', 'Notification Systems Engineer', '5 Axis CNC Machinist']) {
      const doc = page(`<main><div class="jobs-unified-top-card"><h1>${title}</h1></div>${DESCRIPTION}</main>`);
      expect(extractJobTitle(doc), title).toBe(title);
    }
  });

  it('returns empty strings, not placeholder text, when nothing can be read', () => {
    const job = extractJob(page(DESCRIPTION))!;
    expect(job.jobDescription.length).toBeGreaterThan(120);
    expect(job.jobTitle).toBe('');
    expect(job.company).toBe('');
  });
});

describe('expandJobDescription only touches the description', () => {
  it('clicks "Show more" inside the description but never unrelated "See more" buttons', () => {
    const doc = page(`
      <aside><button id="more-jobs">See more jobs</button></aside>
      <section class="skills"><button id="skills">Show more</button></section>
      <div class="jobs-description__content"><p>${'Requirements include experience with many tools and skills. '.repeat(5)}</p><button id="expand">… more</button></div>`);
    const clicked: string[] = [];
    doc.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => clicked.push(b.id)));
    expect(expandJobDescription(doc)).toBe(true);
    expect(clicked).toEqual(['expand']);
  });

  it('does nothing when there is no description yet', () => {
    const doc = page('<button id="a">Show more</button>');
    const clicked: string[] = [];
    doc.querySelector('button')!.addEventListener('click', () => clicked.push('a'));
    expect(expandJobDescription(doc)).toBe(false);
    expect(clicked).toEqual([]);
  });
});
