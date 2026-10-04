import fixture from './__fixtures__/linkedin-job.html?raw';
import { extractCompanyName, extractJob, extractJobTitle, findJobDescriptionSection } from './jobExtractor';
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
