/** Shared between the content script, background worker, and the panel UI. */

export const STORAGE_KEYS = {
  jobData: 'currentJobData',
  jobExtractedAt: 'lastExtracted',
  panelWidth: 'intrvu_panel_width',
  resume: 'intrvufit_resume',
  analysisCache: 'intrvufit_analysis_cache',
  byok: 'intrvufit_byok',
} as const;

/** chrome.runtime / chrome.tabs messages. */
export const MESSAGES = {
  ping: 'PING_CONTENT_SCRIPT',
  getJobDetails: 'getJobDetails',
  extractNow: 'extractNow',
  togglePanel: 'TOGGLE_PANEL',
  openPanel: 'OPEN_PANEL',
  urlChanged: 'URL_CHANGED',
} as const;

/** Posted by the panel iframe to its parent page. */
export const FRAME_MESSAGES = {
  closePanel: 'INTRVU_CLOSE_PANEL',
} as const;

export const MIN_DESCRIPTION_CHARS = 120;

const JOB_URL = /linkedin\.com\/(jobs\/|company\/[^/]+\/jobs(\/|$))/i;

export function isLinkedInJobUrl(url: string | undefined | null): boolean {
  return !!url && JOB_URL.test(url);
}

const JOB_POSTING_URL = /linkedin\.com\/jobs\/view\/\d+/i;

/** A single job posting page. Listing pages (search, collections, the jobs home) are not postings. */
export function isJobPostingUrl(url: string | undefined | null): boolean {
  return !!url && JOB_POSTING_URL.test(url);
}

export interface ExtractedJob {
  url: string;
  jobTitle: string;
  company: string;
  location: string;
  jobDescription: string;
  timestamp: number;
}
