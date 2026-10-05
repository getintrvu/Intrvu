import React, { useCallback, useEffect, useState } from 'react';
import './LinkedInJobExtractor.css';
import { MESSAGES, isLinkedInJobUrl } from '../extension/constants';
import { useJobData } from '../hooks/useJobData';
import type { JobData } from '../types/JobData';

type Phase = 'checking' | 'notJobPage' | 'extracting' | 'ready' | 'failed';

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Ask the page's content script to extract now; inject it first if the tab has none yet. */
async function requestExtraction(tabId: number): Promise<void> {
  const send = (action: string) => chrome.tabs.sendMessage(tabId, { action });
  try {
    await send(MESSAGES.ping);
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  }
  await send(MESSAGES.extractNow);
}

interface View {
  icon: string;
  title: string;
  detail?: string;
  css: string;
}

/** Plain-language description of what was captured, so users can see what will be analyzed. */
function describeJob(job: JobData): View {
  const words = job.jobDescription.trim().split(/\s+/).length.toLocaleString();
  const captured = `${words} words of the job description captured`;
  if (job.jobTitle && job.company) {
    return { icon: '✅', title: 'Job detected', detail: `${job.jobTitle} at ${job.company} · ${captured}`, css: 'status-valid' };
  }
  const missing = !job.jobTitle && !job.company ? 'job title and company' : !job.jobTitle ? 'job title' : 'company';
  return {
    icon: '✅',
    title: 'Job description detected',
    detail: `${captured}. We could not read the ${missing}, which does not affect the analysis.`,
    css: 'status-warning',
  };
}

/** Status chip showing which job the analysis will use. The content script does the extracting
 * and writes the result to storage; this component only reflects it (and can retry). */
const LinkedInJobExtractor: React.FC = () => {
  const job = useJobData();
  const [onJobPage, setOnJobPage] = useState<boolean | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const refresh = () => void activeTab().then((tab) => setOnJobPage(isLinkedInJobUrl(tab?.url)));
    refresh();
    chrome.tabs.onUpdated.addListener(refresh);
    return () => chrome.tabs.onUpdated.removeListener(refresh);
  }, []);

  useEffect(() => {
    if (job) setFailed(false);
  }, [job]);

  const retry = useCallback(async () => {
    setRetrying(true);
    setFailed(false);
    try {
      const tab = await activeTab();
      if (tab?.id === undefined) throw new Error('No active tab');
      await requestExtraction(tab.id);
    } catch {
      setFailed(true);
    } finally {
      setRetrying(false);
    }
  }, []);

  let phase: Phase = 'checking';
  if (job) phase = 'ready';
  else if (onJobPage === false) phase = 'notJobPage';
  else if (failed) phase = 'failed';
  else if (onJobPage) phase = 'extracting';

  const views: Record<Exclude<Phase, 'ready'>, View> = {
    checking: { icon: '🔄', title: 'Checking this page…', css: 'status-checking' },
    notJobPage: {
      icon: 'ℹ️',
      title: 'Open a LinkedIn job posting',
      detail: 'Go to a job on linkedin.com/jobs and this panel will pick up the description automatically.',
      css: 'status-invalid',
    },
    extracting: {
      icon: '🔄',
      title: retrying ? 'Reading the job description…' : 'Looking for the job description…',
      detail: 'This can take a few seconds while LinkedIn loads the posting.',
      css: 'status-extracting',
    },
    failed: {
      icon: '⚠️',
      title: 'Could not read the job description',
      detail: 'Scroll the page so the full description is visible, then try again.',
      css: 'status-invalid',
    },
  };
  const { icon, title, detail, css } = job ? describeJob(job) : views[phase as Exclude<Phase, 'ready'>];

  return (
    <div className="linkedin-job-extractor-compact">
      <div className={`compact-status-indicator ${css}`} role="status">
        <span className="status-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="status-body">
          <span className="status-title">{title}</span>
          {detail && <span className="status-detail">{detail}</span>}
        </span>
        {(phase === 'extracting' || phase === 'failed' || phase === 'ready') && (
          <button
            className="compact-refresh-btn"
            onClick={retry}
            disabled={retrying}
            title="Read the page again"
            aria-label="Read the job description again"
          >
            {retrying ? '…' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
};

export default LinkedInJobExtractor;
