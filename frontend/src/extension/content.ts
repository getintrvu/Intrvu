/**
 * Content script for LinkedIn job pages: extracts the job posting, shows the launcher button,
 * and hosts the side panel. Bundled to a single classic script (see scripts/build-scripts.mjs).
 */
import { ExtractedJob, MESSAGES, STORAGE_KEYS, isJobPostingUrl, isLinkedInJobUrl } from './constants';
import { expandJobDescription, extractJob } from './jobExtractor';
import { Launcher } from './launcher';
import { SidePanel } from './panel';

declare global {
  interface Window {
    __INTRVU_LOADED__?: boolean;
  }
}

const DEBOUNCE_MS = 500;
const STALE_WINDOW_MS = 6000;

function main() {
  // The background worker re-injects this script into open tabs after install/update.
  if (window.__INTRVU_LOADED__) return;
  window.__INTRVU_LOADED__ = true;

  let lastKey = '';
  // After in-page navigation LinkedIn keeps showing the previous job for a moment. Ignore a result
  // identical to the previous job until this deadline, so the old description is not re-captured.
  let staleKey = '';
  let staleUntil = 0;
  let current: ExtractedJob | null = null;
  let debounce: number | undefined;

  const launcher = new Launcher(() => panel.toggle());
  const panel = new SidePanel(
    (visible) => launcher.setPanelVisible(visible),
    (offset) => launcher.setOffset(offset),
  );

  const onJobPage = () => isLinkedInJobUrl(location.href);

  function publish(job: ExtractedJob) {
    current = job;
    chrome.storage.local
      .set({ [STORAGE_KEYS.jobData]: job, [STORAGE_KEYS.jobExtractedAt]: Date.now() })
      .catch(() => undefined);
  }

  function clearJob() {
    lastKey = '';
    current = null;
    chrome.storage.local.remove([STORAGE_KEYS.jobData, STORAGE_KEYS.jobExtractedAt]).catch(() => undefined);
  }

  /** One extraction pass. Returns true when a job is available. */
  function extractOnce(): boolean {
    if (!onJobPage()) return false;
    const job = extractJob(document);
    if (!job) return false;
    const key = `${job.jobTitle}|${job.company}|${job.jobDescription}`;
    if (key === staleKey && Date.now() < staleUntil) return false;
    if (key !== lastKey) {
      lastKey = key;
      publish(job);
    }
    return true;
  }

  async function extractWithRetry(attempts: number, delayMs: number): Promise<boolean> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      expandJobDescription(document);
      if (extractOnce()) return true;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return false;
  }

  /** Open the panel by itself only on a specific posting, never on listing pages (search,
   * collections, jobs home). There the launcher button is still available to open it manually. */
  function autoOpenIfPosting() {
    if (isJobPostingUrl(location.href)) void panel.open({ auto: true });
  }

  function scheduleExtract() {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(extractOnce, DEBOUNCE_MS);
  }

  function handleNavigation() {
    staleKey = lastKey;
    staleUntil = Date.now() + STALE_WINDOW_MS;
    clearJob();
    launcher.setActive(onJobPage());
    if (onJobPage()) {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void extractWithRetry(8, 350), DEBOUNCE_MS);
      autoOpenIfPosting();
    } else {
      panel.close();
    }
  }

  // LinkedIn lazy-renders the description, so watch the DOM and re-extract (debounced).
  new MutationObserver(scheduleExtract).observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.action ?? message?.type) {
      case MESSAGES.ping:
        sendResponse({ success: true, ready: true });
        return false;
      case MESSAGES.getJobDetails:
        if (!current) void extractWithRetry(6, 350);
        sendResponse({ success: true, data: current });
        return false;
      case MESSAGES.extractNow:
        void extractWithRetry(6, 350).then(() => sendResponse({ success: true, data: current }));
        return true; // async response
      case MESSAGES.togglePanel:
        panel.toggle();
        sendResponse({ success: true, visible: panel.isVisible });
        return false;
      case MESSAGES.openPanel:
        void panel.open(); // explicit request (toolbar click on a tab that had no content script)
        sendResponse({ success: true });
        return false;
      case MESSAGES.urlChanged:
        handleNavigation();
        sendResponse({ success: true });
        return false;
      default:
        return false;
    }
  });

  // Initial state for the page we were injected into.
  launcher.setActive(onJobPage());
  if (onJobPage()) {
    extractOnce();
    for (const delay of [900, 2200, 4000]) setTimeout(() => void extractWithRetry(3, 400), delay);
    autoOpenIfPosting();
  }
}

main();
