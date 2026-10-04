/** Floating "Analyze" button shown on LinkedIn job pages. */
const BUTTON_ID = 'intrvu-launcher-button';
const STYLES_ID = 'intrvu-launcher-styles';

// Static markup (no page or user data is ever interpolated into it).
const BUTTON_HTML = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 2C8.45 2 8 2.45 8 3V4H4C3.45 4 3 4.45 3 5V19C3 19.55 3.45 20 4 20H8V21C8 21.55 8.45 22 9 22H15C15.55 22 16 21.55 16 21V20H20C20.55 20 21 19.55 21 19V5C21 4.45 20.55 4 20 4H16V3C16 2.45 15.55 2 15 2H9ZM10 4H14V6H10V4ZM5 6H19V18H5V6ZM7 8V10H17V8H7ZM7 12V14H17V12H7ZM7 16V18H14V16H7Z"/>
  </svg>
  <span>Analyze</span>`;

export class Launcher {
  private button: HTMLButtonElement | null = null;
  private visible = false;
  private observer: MutationObserver | null = null;

  constructor(private readonly onClick: () => void) {}

  /** Show the button on job pages and remove it elsewhere. */
  setActive(active: boolean) {
    if (active) this.mount();
    else this.unmount();
  }

  setPanelVisible(visible: boolean) {
    this.visible = visible;
    this.applyState();
  }

  private applyState() {
    if (!this.button) return;
    this.button.classList.toggle('intrvu-launcher-active', this.visible);
    this.button.setAttribute('aria-pressed', String(this.visible));
    this.button.title = this.visible ? 'Close IntrvuFit Resume Analyzer' : 'Analyze this job against your resume';
  }

  private mount() {
    if (this.button?.isConnected) return;
    this.injectStyles();

    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.className = 'intrvu-launcher';
    button.setAttribute('aria-label', 'Open IntrvuFit Resume Analyzer');
    button.innerHTML = BUTTON_HTML;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onClick();
    });
    document.body.appendChild(button);
    this.button = button;
    this.applyState();

    // LinkedIn re-renders <body> children; put the button back if it gets removed.
    this.observer ??= new MutationObserver(() => {
      if (this.button && !this.button.isConnected) {
        this.button = null;
        this.mount();
      }
    });
    this.observer.observe(document.body, { childList: true });
  }

  private unmount() {
    this.observer?.disconnect();
    this.observer = null;
    this.button?.remove();
    this.button = null;
  }

  private injectStyles() {
    if (document.getElementById(STYLES_ID)) return;
    const link = document.createElement('link');
    link.id = STYLES_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('launcher-button.css');
    document.head.appendChild(link);
  }
}
