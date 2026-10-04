/** MV3 service worker. Keeps tabs wired up; all state lives in chrome.storage, never in memory. */
import { MESSAGES, isLinkedInJobUrl } from './constants';

const LINKEDIN_TABS = ['https://www.linkedin.com/*', 'https://*.linkedin.com/*'];

async function injectContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch {
    /* tab closed, discarded, or not injectable */
  }
}

async function notifyTab(tabId: number, action: string) {
  try {
    await chrome.tabs.sendMessage(tabId, { action });
    return true;
  } catch {
    return false; // no content script in this tab yet
  }
}

/** After install/update/restart, open LinkedIn tabs have no content script until we add one. */
async function injectIntoOpenLinkedInTabs() {
  const tabs = await chrome.tabs.query({ url: LINKEDIN_TABS });
  for (const tab of tabs) {
    if (tab.id !== undefined && isLinkedInJobUrl(tab.url) && !(await notifyTab(tab.id, MESSAGES.ping))) {
      await injectContentScript(tab.id);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => void injectIntoOpenLinkedInTabs());
chrome.runtime.onStartup.addListener(() => void injectIntoOpenLinkedInTabs());

// LinkedIn is a single-page app: in-page navigation only shows up here as a URL change.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (typeof changeInfo.url === 'string' && isLinkedInJobUrl(tab.url)) {
    void notifyTab(tabId, MESSAGES.urlChanged);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return;
  if (!isLinkedInJobUrl(tab.url)) {
    await chrome.tabs.create({ url: 'https://www.linkedin.com/jobs/' });
    return;
  }
  if (!(await notifyTab(tab.id, MESSAGES.togglePanel))) {
    await injectContentScript(tab.id);
    await notifyTab(tab.id, MESSAGES.openPanel);
  }
});
