# Meeting Reminder — Chrome Extension

A Chrome extension that connects to your Google Calendar and alerts you when meetings are approaching. Notifications include a desktop toast with the meeting title and description, plus a brief screen flash on your active browser tab.

## Features

- **Desktop toast notifications** with meeting title and abbreviated description
- **Screen flash overlay** on the active tab as a visual attention signal
- **Configurable lead time** — set how many minutes before a meeting to be notified (1–60, default 5)
- **On/off toggle** per device
- **Multi-calendar support** — monitors all calendars you have visible in Google Calendar
- **Smart filtering** — excludes all-day events, cancelled events, and events you've declined
- **Deduplication** — each meeting triggers at most one notification per window

## Prerequisites

- Google Chrome (or Chromium-based browser)
- A Google account with Google Calendar
- A Google Cloud Platform project with the Calendar API enabled

## Setup

### 1. Create a GCP OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one).
3. Navigate to **APIs & Services > Library** and enable the **Google Calendar API**.
4. Navigate to **APIs & Services > Credentials** and click **Create Credentials > OAuth client ID**.
5. Select **Chrome Extension** as the application type.
6. You'll need your extension ID — get it from step 2 below, then come back and enter it here.
7. Copy the generated **Client ID**.

### 2. Configure the Extension

1. Clone this repository:
   ```bash
   git clone <repo-url>
   cd chrome-mtg-reminder
   ```
2. Open `manifest.json` and replace `YOUR_CLIENT_ID.apps.googleusercontent.com` with your actual OAuth client ID from step 1.

### 3. Load the Extension in Chrome

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in the top right).
3. Click **Load unpacked** and select the `chrome-mtg-reminder` directory.
4. Note the **Extension ID** shown on the card — if you haven't set it in GCP yet, go back to step 1.6 and add it.

### 4. Sign In

1. Click the extension icon in the Chrome toolbar.
2. Click **Sign in with Google** and complete the consent flow.
3. Once signed in, the settings panel appears.

## Usage

- **Toggle notifications** on or off with the switch in the popup.
- **Set lead time** by entering a number of minutes (1–60) in the popup. This syncs across devices.
- The extension polls your calendar every minute. When a meeting falls within your lead time window, you'll see:
  - A **desktop notification** with the meeting name and description
  - A brief **blue flash** on your active browser tab
- Click a notification to open the event in Google Calendar.

## Testing

Run the unit tests:

```bash
node --test tests/background.test.js
```

Tests cover event filtering (all-day, cancelled, declined, tentative, solo events), notification deduplication with pruning, description truncation, and settings storage defaults.

## Project Structure

```
chrome-mtg-reminder/
  manifest.json           # MV3 manifest with permissions and OAuth config
  background.js           # Service worker: polling, auth, notifications, flash
  popup/
    popup.html            # Extension popup UI
    popup.js              # Auth flow and settings logic
    popup.css             # Popup styling
  content/
    overlay.js            # Screen flash overlay (injected on demand)
  icons/
    icon16.png            # Toolbar icon
    icon48.png            # Extensions page icon
    icon128.png           # Install dialog icon
  tests/
    background.test.js    # Unit tests for filtering, dedup, and settings
```

## Notes

- The extension uses `chrome.identity` for OAuth — tokens are managed by Chrome internally and never stored in extension storage.
- The screen flash requires the `<all_urls>` host permission to inject into arbitrary tabs. It silently skips `chrome://` and other protected pages.
- The on/off toggle is per-device (`chrome.storage.local`). The lead time setting syncs across devices (`chrome.storage.sync`).
- The calendar list is cached for 1 hour to reduce API calls. Newly shared calendars may take up to an hour to appear.
