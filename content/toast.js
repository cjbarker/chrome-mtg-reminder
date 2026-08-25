// Meeting Reminder - In-page Toast Notification
// Injected on demand via chrome.scripting.executeScript({ func: renderMeetingToast, args: [...] })
// Must be self-contained: no closures over outer scope, since it runs as a serialized function.

export function renderMeetingToast(title, summary, joinUrl, minsAway) {
  const HOLD_MS = 6000;
  const TRANSITION_MS = 300;
  const GAP = 8;

  if (!document.getElementById('mtg-toast-style')) {
    const style = document.createElement('style');
    style.id = 'mtg-toast-style';
    style.textContent = `
      .mtg-toast {
        position: fixed;
        left: 50%;
        width: min(360px, calc(100vw - 32px));
        box-sizing: border-box;
        background: #fff;
        color: #1a1a1a;
        border-left: 4px solid #4285f4;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        padding: 12px 32px 12px 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        z-index: 2147483647;
        cursor: pointer;
        transform: translate(-50%, -150%);
        transition: transform ${TRANSITION_MS}ms ease-out;
      }
      .mtg-toast-title {
        font-weight: 600;
        margin-bottom: 2px;
      }
      .mtg-toast-summary {
        color: #1a1a1a;
        margin-bottom: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mtg-toast-time {
        color: #5f6368;
        font-size: 12px;
      }
      .mtg-toast-close {
        position: absolute;
        top: 6px;
        right: 8px;
        background: none;
        border: none;
        font-size: 16px;
        line-height: 1;
        color: #5f6368;
        cursor: pointer;
        padding: 4px;
      }
      .mtg-toast-close:hover {
        color: #1a1a1a;
      }
    `;
    document.head.appendChild(style);
  }

  const stacked = document.querySelectorAll('.mtg-toast');
  let top = 16;
  stacked.forEach((el) => {
    top += el.getBoundingClientRect().height + GAP;
  });

  const toast = document.createElement('div');
  toast.className = 'mtg-toast';
  toast.style.top = `${top}px`;

  const titleEl = document.createElement('div');
  titleEl.className = 'mtg-toast-title';
  titleEl.textContent = title;

  const summaryEl = document.createElement('div');
  summaryEl.className = 'mtg-toast-summary';
  summaryEl.textContent = summary;

  const timeEl = document.createElement('div');
  timeEl.className = 'mtg-toast-time';
  timeEl.textContent = minsAway > 0 ? `Starts in ${minsAway} minute${minsAway !== 1 ? 's' : ''}` : 'Starting now';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'mtg-toast-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', 'Dismiss');

  toast.appendChild(titleEl);
  toast.appendChild(summaryEl);
  toast.appendChild(timeEl);
  toast.appendChild(closeBtn);
  document.documentElement.appendChild(toast);

  let dismissed = false;
  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    clearTimeout(autoDismissTimer);
    toast.style.transform = 'translate(-50%, -150%)';
    setTimeout(() => toast.remove(), TRANSITION_MS);
  }

  toast.addEventListener('click', () => {
    if (joinUrl) window.open(joinUrl, '_blank');
    dismiss();
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });

  const autoDismissTimer = setTimeout(dismiss, HOLD_MS);

  requestAnimationFrame(() => {
    toast.style.transform = 'translate(-50%, 0)';
  });
}
