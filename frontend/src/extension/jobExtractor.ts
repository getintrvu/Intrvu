/**
 * Pure DOM functions that pull a job posting out of a LinkedIn page. They take a Document so
 * they can be tested against saved HTML (see __fixtures__).
 *
 * LinkedIn's markup changes often and its pages are full of other headings ("0 notifications",
 * "Messaging", "People also viewed"), so title and company are found by trying several sources
 * in order of reliability and rejecting anything that looks like page chrome.
 */
import { MIN_DESCRIPTION_CHARS, type ExtractedJob } from './constants';

// ---------------------------------------------------------------- description
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

// ---------------------------------------------------------------- title and company
/** Headings that are page chrome, not the job title. */
const NOISE_HEADING =
  /^\d+\s*(new\s+)?notifications?|^notifications?(\s+total)?$|^messaging$|^linkedin$|skip to|people also viewed|similar jobs|more jobs|top job picks|jobs? (for you|based on|you may)|search results?|saved jobs?|job alerts?|set alert|^about the (job|company)|try premium|premium (member|trial)|^show (all|more)|^see (all|more)|you(['’]re| are) viewing|^promoted|^easy apply$|^sign in|^join now/i;

/** Page regions that never contain the job title. */
const CHROME_REGION = 'nav, header, aside, footer, [role="navigation"], [role="banner"], [role="complementary"], [class*="global-nav"], [class*="notification"], [class*="messaging"], [class*="msg-overlay"], #global-nav';

const TOP_CARD = '[class*="top-card"], [class*="job-details-jobs-unified"], [data-testid*="top-card"]';

const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();

function plausibleTitle(text: string): boolean {
  return text.length > 2 && text.length < 150 && !NOISE_HEADING.test(text);
}

function insideChrome(el: Element): boolean {
  return !!el.closest(CHROME_REGION);
}

interface JsonLdJob {
  title?: string;
  hiringOrganization?: { name?: string } | string;
}

/** LinkedIn's public job pages embed schema.org JobPosting data: the most reliable source. */
function readJsonLd(doc: Document): JsonLdJob | null {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent || 'null');
      const nodes: unknown[] = Array.isArray(data) ? data : data?.['@graph'] ? data['@graph'] : [data];
      const job = nodes.find((n) => (n as { '@type'?: string })?.['@type'] === 'JobPosting');
      if (job) return job as JsonLdJob;
    } catch {
      /* malformed JSON-LD: ignore */
    }
  }
  return null;
}

/** "Senior Engineer | NielsenIQ | LinkedIn" -> { title, company } */
function readDocumentTitle(doc: Document): { title?: string; company?: string } {
  const match = clean(doc.title).replace(/^\(\d+\)\s*/, '').match(/^(.+?)\s+\|\s+(.+?)\s+\|\s+LinkedIn$/i);
  return match ? { title: match[1], company: match[2] } : {};
}

export function extractJobTitle(doc: Document, descriptionContainer?: Element | null): string {
  // 1. Structured data
  const ld = clean(readJsonLd(doc)?.title);
  if (plausibleTitle(ld)) return ld;

  // 2. LinkedIn's own top-card title elements
  const topCardTitle = doc.querySelector(
    '[class*="top-card"][class*="job-title"], [class*="job-details-jobs-unified-top-card__job-title"], [data-testid*="job-title"]',
  );
  const topCardText = clean(topCardTitle?.textContent);
  if (topCardTitle && !insideChrome(topCardTitle) && plausibleTitle(topCardText)) return topCardText;

  // 3. Best-scoring heading that is not page chrome
  let best: { text: string; score: number } | null = null;
  for (const el of Array.from(doc.querySelectorAll('h1, h2, [role="heading"]'))) {
    const text = clean(el.textContent);
    if (!plausibleTitle(text) || insideChrome(el)) continue;
    let score = 0;
    if (el.tagName === 'H1') score += 2;
    if (el.querySelector('a[href*="/jobs/view/"]') || el.closest('a[href*="/jobs/view/"]')) score += 4;
    if (el.closest(TOP_CARD)) score += 3;
    if (descriptionContainer && el.compareDocumentPosition(descriptionContainer) & Node.DOCUMENT_POSITION_FOLLOWING) score += 1;
    if (!best || score > best.score) best = { text, score };
  }
  if (best && best.score > 0) return best.text;

  // 4. The browser tab title
  const fromTab = clean(readDocumentTitle(doc).title);
  if (plausibleTitle(fromTab)) return fromTab;

  return best?.text ?? '';
}

export function extractCompanyName(doc: Document): string {
  const ld = readJsonLd(doc)?.hiringOrganization;
  const ldName = clean(typeof ld === 'string' ? ld : ld?.name);
  if (ldName) return ldName;

  const named = doc.querySelector('[class*="company-name"], [data-testid*="company-name"]');
  const namedText = clean(named?.textContent);
  if (named && !insideChrome(named) && namedText.length > 1 && namedText.length < 100) return namedText;

  // Company links, preferring the ones in the job's top card over sidebar suggestions.
  const links = Array.from(doc.querySelectorAll('a[href*="/company/"]')).filter((a) => !insideChrome(a));
  links.sort((a, b) => Number(!!b.closest(TOP_CARD)) - Number(!!a.closest(TOP_CARD)));
  for (const link of links) {
    const text = clean(link.textContent);
    if (text.length > 1 && text.length < 100 && !NOISE_HEADING.test(text)) return text;
  }

  return clean(readDocumentTitle(doc).company);
}

/** Matches "Show more", "See more", "…more" and "... more" button labels. */
const EXPAND_LABEL = /^(?:…|\.\.\.)?\s*(?:(?:show|see)\s+)?more$/i;

/**
 * Click LinkedIn's "show more" so the whole description is in the DOM. Only buttons inside the
 * description (or the block directly around it) are considered: the page has other "See more"
 * buttons (more jobs, skills, company info) that must never be clicked.
 */
export function expandJobDescription(doc: Document): boolean {
  const description = findJobDescriptionSection(doc);
  if (!description) return false;

  const scopes = [description, description.parentElement, description.parentElement?.parentElement];
  for (const scope of scopes) {
    if (!scope) continue;
    for (const button of Array.from(scope.querySelectorAll<HTMLElement>('button, a[role="button"], [role="button"]'))) {
      const label = clean(button.textContent);
      const aria = clean(button.getAttribute('aria-label'));
      if (EXPAND_LABEL.test(label) || /(?:see|show) more/i.test(aria)) {
        try {
          button.click();
          return true;
        } catch {
          /* try the next candidate */
        }
      }
    }
  }
  return false;
}

/** Returns the job on the page, or null when no usable description is present yet. Title and
 * company are empty strings when they could not be read (the description is what matters). */
export function extractJob(doc: Document): ExtractedJob | null {
  const container = findJobDescriptionSection(doc);
  const description = container ? extractAndCleanText(container) : '';
  if (description.length < MIN_DESCRIPTION_CHARS) return null;

  return {
    url: doc.location?.href ?? '',
    jobTitle: extractJobTitle(doc, container),
    company: extractCompanyName(doc),
    location: '',
    jobDescription: description,
    timestamp: Date.now(),
  };
}
