/**
 * Pure DOM functions that pull a job posting out of a LinkedIn page. They take a Document so
 * they can be tested against saved HTML (see test-linkedin-job.html).
 */
import { MIN_DESCRIPTION_CHARS, type ExtractedJob } from './constants';

const DESCRIPTION_SELECTORS = [
  '.jobs-description__content',
  '.jobs-description-content__text',
  '.jobs-box__html-content',
  '.jobs-description',
  '[data-test-id="job-details"]',
  '[data-testid="job-details"]',
  '[data-testid="job-details-module"]',
  '[data-testid="expandable-text-box"]',
  '.show-more-less-html__markup',
];

const HEADER_PATTERNS = [/about the job/i, /job description/i, /description/i, /job details/i];
const JOB_KEYWORDS = ['responsibilities', 'requirements', 'qualifications', 'experience', 'skills', 'what you'];
const UNWANTED_SELECTORS = ['button', 'svg', 'img', 'a[href*="premium"]', '[class*="upsell"]', '[class*="premium"]', 'nav', 'aside', 'footer'];
const BOILERPLATE = [
  /about the company[\s\S]*?(?=\n\n|$)/i,
  /follow us on:[\s\S]*?(?=\n\n|$)/i,
  /equal opportunity employer[\s\S]*?(?=\n\n|$)/i,
  /our commitment to diversity[\s\S]*?(?=\n\n|$)/i,
  /for more information,? visit[\s\S]*?(?=\n\n|$)/i,
  /try premium for[\s\S]*?(?=\n\n|$)/i,
  /get ai-powered advice[\s\S]*?(?=\n\n|$)/i,
];

const textOf = (el: Element) => ((el as HTMLElement).innerText || el.textContent || '').trim();

export function hasSubstantialContent(el: Element | null): boolean {
  if (!el) return false;
  const text = textOf(el);
  if (text.length < MIN_DESCRIPTION_CHARS) return false;
  if (text.length >= 500) return true;
  const lower = text.toLowerCase();
  return JOB_KEYWORDS.some((k) => lower.includes(k));
}

function findContentContainer(header: Element, doc: Document): Element | null {
  const next = header.nextElementSibling;
  if (next && hasSubstantialContent(next)) return next;

  const parentNext = header.parentElement?.nextElementSibling;
  if (parentNext && hasSubstantialContent(parentNext)) return parentNext;

  let current = header.parentElement;
  for (let depth = 0; current && current !== doc.body && depth < 5; depth++) {
    for (const child of Array.from(current.children)) {
      if (child !== header && hasSubstantialContent(child)) return child;
    }
    current = current.parentElement;
  }
  return null;
}

export function findJobDescriptionSection(doc: Document): Element | null {
  for (const selector of DESCRIPTION_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el && hasSubstantialContent(el)) return el;
  }

  for (const header of Array.from(doc.querySelectorAll('h1, h2, h3, [role="heading"]'))) {
    const headerText = (header.textContent || '').trim();
    if (HEADER_PATTERNS.some((p) => p.test(headerText))) {
      const container = findContentContainer(header, doc);
      if (container) return container;
    }
  }

  return doc.querySelector('[data-testid="expandable-text-box"]');
}

export function extractAndCleanText(container: Element): string {
  const clone = container.cloneNode(true) as Element;
  for (const selector of UNWANTED_SELECTORS) {
    clone.querySelectorAll(selector).forEach((el) => el.remove());
  }
  let text = (clone as HTMLElement).innerText || clone.textContent || '';
  for (const pattern of BOILERPLATE) text = text.replace(pattern, '');
  return text.replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractJobTitle(doc: Document): string {
  for (const h1 of Array.from(doc.querySelectorAll('h1'))) {
    const text = (h1.textContent || '').trim();
    if (text.length > 5 && text.length < 150) return text;
  }
  for (const h2 of Array.from(doc.querySelectorAll('h2'))) {
    const text = (h2.textContent || '').trim();
    if (text.length > 5 && text.length < 150 && !/about|company|people|similar/i.test(text)) return text;
  }
  return 'Job Title Not Found';
}

export function extractCompanyName(doc: Document): string {
  for (const link of Array.from(doc.querySelectorAll('a[href*="/company/"]'))) {
    const text = (link.textContent || '').trim();
    if (text.length > 1 && text.length < 100) return text;
  }
  for (const link of Array.from(doc.querySelectorAll('a')).slice(0, 20)) {
    const text = (link.textContent || '').trim();
    if (text.length > 2 && text.length < 100 && !text.includes('LinkedIn') && !text.includes('Sign in') && !text.includes('Join now')) {
      return text;
    }
  }
  return 'Company Not Found';
}

/** Click LinkedIn's "show more" so the whole description is in the DOM. */
export function expandJobDescription(doc: Document): boolean {
  for (const button of Array.from(doc.querySelectorAll<HTMLElement>('button, a[role="button"]'))) {
    const text = (button.textContent || '').trim().toLowerCase();
    if (text.includes('show more') || text.includes('see more')) {
      try {
        button.click();
        return true;
      } catch {
        /* ignore and try the next candidate */
      }
    }
  }
  return false;
}

/** Returns the job on the page, or null when no usable description is present yet. */
export function extractJob(doc: Document): ExtractedJob | null {
  const container = findJobDescriptionSection(doc);
  const description = container ? extractAndCleanText(container) : '';
  if (description.length < MIN_DESCRIPTION_CHARS) return null;

  return {
    url: doc.location?.href ?? '',
    jobTitle: extractJobTitle(doc),
    company: extractCompanyName(doc),
    location: '',
    jobDescription: description,
    timestamp: Date.now(),
  };
}
