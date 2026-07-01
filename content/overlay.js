// Meeting Reminder - Screen Flash Overlay
// Injected on demand via chrome.scripting.executeScript
// Idempotent — safe to inject multiple times

(function () {
  if (document.getElementById('mtg-flash-overlay')) return;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes mtg-flash-pulse {
      0%   { opacity: 1; }
      50%  { opacity: 0; }
      100% { opacity: 1; }
    }
    @keyframes mtg-flash-fade {
      0%   { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'mtg-flash-overlay';
  overlay.style.cssText = [
    'position: fixed',
    'top: 0',
    'left: 0',
    'width: 100vw',
    'height: 100vh',
    'background: rgba(66, 133, 244, 0.35)',
    'z-index: 2147483647',
    'pointer-events: none',
    'animation: mtg-flash-pulse 0.5s ease-in-out 2, mtg-flash-fade 0.5s ease-out 1s forwards',
  ].join(';');

  document.documentElement.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
    style.remove();
  }, 1600);
})();
