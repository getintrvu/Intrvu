import React, { useCallback, useEffect, useState } from 'react';
import './LinkedInJobExtractor.css';
import { MESSAGES, isLinkedInJobUrl } from '../extension/constants';
import { useJobData } from '../hooks/useJobData';

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

  const view: Record<Phase, { icon: string; text: string; css: string }> = {
    checking: { icon: '🔄', text: 'Checking page…', css: 'status-checking' },
    notJobPage: { icon: '❌', text: 'Navigate to a LinkedIn job page', css: 'status-invalid' },
    extracting: { icon: '🔄', text: retrying ? 'Extracting job details…' : 'Waiting for the job description…', css: 'status-extracting' },
    ready: { icon: '✅', text: job ? `${job.jobTitle} at ${job.company}` : '', css: 'status-valid' },
    failed: { icon: '❌', text: 'Could not read the job description', css: 'status-invalid' },
  };
  const { icon, text, css } = view[phase];

  return (
    <div className="linkedin-job-extractor-compact">
      <div className={`compact-status-indicator ${css}`} role="status">
        <span className="status-icon">{icon}</span>
        <span className="status-text">{text}</span>
        {(phase === 'extracting' || phase === 'failed') && (
          <button className="compact-refresh-btn" onClick={retry} disabled={retrying} title="Try again" aria-label="Try extracting again">
            🔄
          </button>
        )}
      </div>
    </div>
  );
};

export default LinkedInJobExtractor;
