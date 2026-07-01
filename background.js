// Meeting Reminder - Background Service Worker
// All event listeners registered synchronously at top level (MV3 requirement)

const ALARM_NAME = 'calendarPoll';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const CALENDAR_CACHE_TTL = 3600000; // 1 hour

// --- Auth (U3) ---

async function getToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message || 'No token'));
      } else {
        resolve(token);
      }
    });
  });
}

async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function fetchWithAuth(url, token) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 401) {
    await removeCachedToken(token);
    const newToken = await getToken();
    const retry = await fetch(url, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    if (!retry.ok) throw new Error(`API error: ${retry.status}`);
    return retry.json();
  }
  if (!resp.ok) throw new Error(`API error: ${resp.status}`);
  return resp.json();
}

// --- Calendar Polling (U4) ---

async function getCalendarIds(token) {
  const { calendarCache, calendarCacheTime } = await chrome.storage.local.get([
    'calendarCache',
    'calendarCacheTime',
  ]);

  if (calendarCache && calendarCacheTime && Date.now() - calendarCacheTime < CALENDAR_CACHE_TTL) {
    return calendarCache;
  }

  const data = await fetchWithAuth(
    `${CALENDAR_API}/users/me/calendarList?fields=items(id,selected)`,
    token
  );
  const ids = (data.items || []).filter((c) => c.selected).map((c) => c.id);
  await chrome.storage.local.set({ calendarCache: ids, calendarCacheTime: Date.now() });
  return ids;
}

function isDeclined(event) {
  if (!event.attendees) return false;
  const self = event.attendees.find((a) => a.self);
  return self?.responseStatus === 'declined';
}

async function getUpcomingEvents(token, leadTimeMinutes) {
  const calendarIds = await getCalendarIds(token);
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + leadTimeMinutes * 60000).toISOString();
  const fields = 'items(id,summary,description,start,end,status,attendees,hangoutLink)';

  const allEvents = [];
  for (const calId of calendarIds) {
    const url =
      `${CALENDAR_API}/calendars/${encodeURIComponent(calId)}/events` +
      `?timeMin=${timeMin}&timeMax=${timeMax}` +
      `&singleEvents=true&orderBy=startTime&maxResults=50` +
      `&fields=${fields}`;
    try {
      const data = await fetchWithAuth(url, token);
      if (data.items) allEvents.push(...data.items);
    } catch (err) {
      console.warn(`Failed to fetch events for ${calId}:`, err.message);
    }
  }

  return allEvents.filter((e) => {
    if (e.start?.date) return false; // all-day event
    if (e.status === 'cancelled') return false;
    if (isDeclined(e)) return false;
    return true;
  });
}

async function dedup(events) {
  const { notifiedIds = {} } = await chrome.storage.local.get('notifiedIds');

  // Prune entries older than 24 hours
  const cutoff = Date.now() - 86400000;
  const pruned = {};
  for (const [id, ts] of Object.entries(notifiedIds)) {
    if (ts > cutoff) pruned[id] = ts;
  }

  const newEvents = events.filter((e) => !pruned[e.id]);
  for (const e of newEvents) {
    pruned[e.id] = Date.now();
  }
  await chrome.storage.local.set({ notifiedIds: pruned });
  return newEvents;
}

// --- Notifications (U5) ---

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function createNotification(event) {
  const now = Date.now();
  const startMs = new Date(event.start.dateTime).getTime();
  const minsAway = Math.max(0, Math.round((startMs - now) / 60000));
  const title = minsAway > 0 ? `Meeting in ${minsAway} minute${minsAway !== 1 ? 's' : ''}` : 'Meeting starting now';

  chrome.notifications.create(`mtg-${event.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message: event.summary || '(No title)',
    contextMessage: truncate(event.description, 100),
    priority: 2,
  });
}

// --- Screen Flash (U6) ---

async function flashActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) return;
    const tab = tabs[0];
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://')) {
      return;
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/overlay.js'],
    });
  } catch {
    // Silently fail on unscriptable pages — toast is the reliable fallback
  }
}

// --- Poll Cycle ---

async function pollCalendar() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  if (!enabled) return;

  const { leadTimeMinutes } = await chrome.storage.sync.get({ leadTimeMinutes: 5 });

  let token;
  try {
    token = await getToken();
  } catch {
    await chrome.storage.local.set({ authNeeded: true });
    return;
  }

  try {
    const events = await getUpcomingEvents(token, leadTimeMinutes);
    const newEvents = await dedup(events);

    if (newEvents.length > 0) {
      for (const event of newEvents) {
        createNotification(event);
      }
      // Flash once per poll cycle regardless of event count
      await flashActiveTab();
    }
  } catch (err) {
    if (err.message?.includes('401')) {
      await chrome.storage.local.set({ authNeeded: true });
    }
    console.error('Poll failed:', err.message);
  }
}

// --- Alarm Management ---

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
  }
}

async function clearAlarm() {
  await chrome.alarms.clear(ALARM_NAME);
}

// --- Event Listeners (top-level, synchronous registration) ---

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ enabled: true });
    await chrome.storage.sync.set({ leadTimeMinutes: 5 });
  }
  await ensureAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    pollCalendar();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.enabled) {
    if (changes.enabled.newValue) {
      ensureAlarm();
    } else {
      clearAlarm();
    }
  }
});

chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId.startsWith('mtg-')) {
    const eventId = notifId.slice(4);
    const eid = btoa(eventId).replace(/=/g, '');
    chrome.tabs.create({
      url: `https://calendar.google.com/calendar/event?eid=${eid}`,
    });
    chrome.notifications.clear(notifId);
  }
});
