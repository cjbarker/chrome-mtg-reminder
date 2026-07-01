const authView = document.getElementById('auth-view');
const settingsView = document.getElementById('settings-view');
const signInBtn = document.getElementById('sign-in-btn');
const authError = document.getElementById('auth-error');
const enabledToggle = document.getElementById('enabled-toggle');
const leadTimeInput = document.getElementById('lead-time');
const statusBar = document.getElementById('status-bar');

// --- Auth ---

function showAuth(message) {
  authView.style.display = '';
  settingsView.style.display = 'none';
  if (message) {
    authError.textContent = message;
    authError.style.display = '';
  } else {
    authError.style.display = 'none';
  }
}

function showSettings() {
  authView.style.display = 'none';
  settingsView.style.display = '';
}

signInBtn.addEventListener('click', () => {
  signInBtn.disabled = true;
  chrome.identity.getAuthToken({ interactive: true }, (token) => {
    signInBtn.disabled = false;
    if (chrome.runtime.lastError || !token) {
      showAuth('Sign-in failed. Please try again.');
      return;
    }
    chrome.storage.local.set({ authNeeded: false });
    showSettings();
    loadSettings();
    statusBar.textContent = 'Signed in';
  });
});

// --- Settings ---

function loadSettings() {
  chrome.storage.local.get({ enabled: true, authNeeded: false }, (local) => {
    if (local.authNeeded) {
      showAuth('Please sign in again to continue receiving reminders.');
      return;
    }
    enabledToggle.checked = local.enabled;
    chrome.storage.sync.get({ leadTimeMinutes: 5 }, (sync) => {
      leadTimeInput.value = sync.leadTimeMinutes;
      showSettings();
    });
  });
}

enabledToggle.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabledToggle.checked });
});

leadTimeInput.addEventListener('change', () => {
  let val = parseInt(leadTimeInput.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  if (val > 60) val = 60;
  leadTimeInput.value = val;
  chrome.storage.sync.set({ leadTimeMinutes: val });
});

// --- Init ---

function init() {
  chrome.identity.getAuthToken({ interactive: false }, (token) => {
    if (chrome.runtime.lastError || !token) {
      chrome.storage.local.get({ authNeeded: false }, (local) => {
        showAuth(local.authNeeded ? 'Please sign in again to continue receiving reminders.' : null);
      });
      return;
    }
    loadSettings();
  });
}

init();
