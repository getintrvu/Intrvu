/** The slide-in side panel (an iframe of the extension UI) that the content script injects. */
import { FRAME_MESSAGES, STORAGE_KEYS } from './constants';

const PANEL_ID = 'intrvu-side-panel-container';
const HANDLE_ID = 'intrvu-resize-handle';
const CONTENT_ID = 'intrvu-panel-content';
const IFRAME_ID = 'intrvu-panel-iframe';
const OVERLAY_ID = 'intrvu-resize-overlay';
const STYLES_ID = 'intrvu-panel-styles';
const DEFAULT_WIDTH = 450;
const MIN_WIDTH = 300;
const MAX_WIDTH = 800;

export class SidePanel {
  private container: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private overlay: HTMLElement | null = null;
  private width = DEFAULT_WIDTH;
  private visible = false;
  /** Set when the user closes the panel, so automatic opening stops for this page session. */
  private dismissedByUser = false;

  constructor(private readonly onVisibilityChange: (visible: boolean) => void) {
    window.addEventListener('message', this.handleFrameMessage);
  }

  get isVisible() {
    return this.visible;
  }

  toggle() {
    if (this.visible) this.close(true);
    else this.open();
  }

  /** `auto` opens (e.g. on arriving at a job page) are ignored once the user has closed the panel. */
  async open({ auto = false } = {}) {
    if (auto && this.dismissedByUser) return;
    if (!auto) this.dismissedByUser = false;
    await this.ensureCreated();
    this.container?.classList.add('intrvu-panel-visible');
    this.setVisible(true);
  }

  close(byUser = false) {
    if (byUser) this.dismissedByUser = true;
    this.container?.classList.remove('intrvu-panel-visible');
    this.setVisible(false);
  }

  private setVisible(visible: boolean) {
    this.visible = visible;
    this.onVisibilityChange(visible);
  }

  private async ensureCreated() {
    if (this.container) return;

    const stored = await chrome.storage.local.get(STORAGE_KEYS.panelWidth);
    const savedWidth = Number(stored[STORAGE_KEYS.panelWidth]);
    if (Number.isFinite(savedWidth) && savedWidth >= MIN_WIDTH) this.width = Math.min(savedWidth, MAX_WIDTH);

    this.injectStyles();

    const container = document.createElement('div');
    container.id = PANEL_ID;
    container.style.width = `${this.width}px`;

    const handle = document.createElement('div');
    handle.id = HANDLE_ID;
    handle.addEventListener('mousedown', this.startResize);

    const content = document.createElement('div');
    content.id = CONTENT_ID;

    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.src = chrome.runtime.getURL('index.html');
    iframe.title = 'IntrvuFit';
    content.appendChild(iframe);

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;

    container.append(handle, content);
    document.body.append(container, overlay);
    this.container = container;
    this.iframe = iframe;
    this.overlay = overlay;
  }

  private injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const link = document.createElement('link');
    link.id = STYLES_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('side-panel.css');
    document.head.appendChild(link);
  }

  /** Only our own iframe may ask the page to close the panel. */
  private handleFrameMessage = (event: MessageEvent) => {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;
    if (event.origin !== new URL(chrome.runtime.getURL('')).origin) return;
    if (event.data?.type === FRAME_MESSAGES.closePanel) this.close(true);
  };

  private startX = 0;
  private startWidth = 0;

  private startResize = (event: MouseEvent) => {
    event.preventDefault();
    this.startX = event.clientX;
    this.startWidth = this.width;
    this.container?.classList.add('intrvu-resizing');
    this.overlay?.classList.add('active');
    document.addEventListener('mousemove', this.doResize);
    document.addEventListener('mouseup', this.stopResize);
  };

  private doResize = (event: MouseEvent) => {
    const max = Math.min(MAX_WIDTH, window.innerWidth * 0.5);
    this.width = Math.max(MIN_WIDTH, Math.min(this.startWidth + (this.startX - event.clientX), max));
    if (this.container) this.container.style.width = `${this.width}px`;
  };

  private stopResize = () => {
    this.container?.classList.remove('intrvu-resizing');
    this.overlay?.classList.remove('active');
    document.removeEventListener('mousemove', this.doResize);
    document.removeEventListener('mouseup', this.stopResize);
    void chrome.storage.local.set({ [STORAGE_KEYS.panelWidth]: this.width });
  };
}
