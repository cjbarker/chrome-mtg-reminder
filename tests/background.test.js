import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// --- Mock chrome APIs ---

const storage = { local: {}, sync: {} };

globalThis.chrome = {
  storage: {
    local: {
      get: (defaults, cb) => {
        if (typeof defaults === 'function') { cb = defaults; defaults = {}; }
        const result = { ...defaults };
        for (const key of Object.keys(defaults)) {
          if (key in storage.local) result[key] = storage.local[key];
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set: (items, cb) => {
        Object.assign(storage.local, items);
        if (cb) cb();
        return Promise.resolve();
      },
    },
    sync: {
      get: (defaults, cb) => {
        if (typeof defaults === 'function') { cb = defaults; defaults = {}; }
        const result = { ...defaults };
        for (const key of Object.keys(defaults)) {
          if (key in storage.sync) result[key] = storage.sync[key];
        }
        if (cb) cb(result);
        return Promise.resolve(result);
      },
      set: (items, cb) => {
        Object.assign(storage.sync, items);
        if (cb) cb();
        return Promise.resolve();
      },
    },
  },
  identity: {
    getAuthToken: (_opts, cb) => cb('mock-token'),
    removeCachedAuthToken: (_opts, cb) => cb(),
  },
  alarms: {
    get: (_name, cb) => cb(null),
    create: () => {},
    clear: () => Promise.resolve(),
    onAlarm: { addListener: () => {} },
  },
  runtime: {
    lastError: null,
    onInstalled: { addListener: () => {} },
    onStartup: { addListener: () => {} },
  },
  notifications: {
    create: () => {},
    clear: () => {},
    onClicked: { addListener: () => {} },
  },
  tabs: {
    query: () => Promise.resolve([]),
    create: () => {},
  },
  scripting: {
    executeScript: () => Promise.resolve(),
  },
  storage: {
    ...globalThis.chrome?.storage,
    onChanged: { addListener: () => {} },
  },
};

// Reassign storage methods after spread
chrome.storage.local = {
  get: (defaults, cb) => {
    const result = typeof defaults === 'string' ? {} : { ...defaults };
    const keys = typeof defaults === 'string' ? [defaults] : Array.isArray(defaults) ? defaults : Object.keys(defaults);
    for (const key of keys) {
      if (key in storage.local) result[key] = storage.local[key];
    }
    if (cb) cb(result);
    return Promise.resolve(result);
  },
  set: (items, cb) => {
    Object.assign(storage.local, items);
    if (cb) cb();
    return Promise.resolve();
  },
};

chrome.storage.sync = {
  get: (defaults, cb) => {
    const result = typeof defaults === 'string' ? {} : { ...defaults };
    const keys = typeof defaults === 'string' ? [defaults] : Array.isArray(defaults) ? defaults : Object.keys(defaults);
    for (const key of keys) {
      if (key in storage.sync) result[key] = storage.sync[key];
    }
    if (cb) cb(result);
    return Promise.resolve(result);
  },
  set: (items, cb) => {
    Object.assign(storage.sync, items);
    if (cb) cb();
    return Promise.resolve();
  },
};

// --- Event filtering tests ---

function isDeclined(event) {
  if (!event.attendees) return false;
  const self = event.attendees.find((a) => a.self);
  return self?.responseStatus === 'declined';
}

function filterEvents(events) {
  return events.filter((e) => {
    if (e.start?.date) return false;
    if (e.status === 'cancelled') return false;
    if (isDeclined(e)) return false;
    return true;
  });
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

async function dedup(events) {
  const { notifiedIds = {} } = await chrome.storage.local.get({ notifiedIds: {} });
  const cutoff = Date.now() - 86400000;
  const pruned = {};
  for (const [id, ts] of Object.entries(notifiedIds)) {
    if (ts > cutoff) pruned[id] = ts;
  }
  const newEvents = events.filter((e) => !pruned[e.id]);
  for (const e of newEvents) {
    pruned[e.id] = Date.now();
  }
  storage.local.notifiedIds = pruned;
  return newEvents;
}

// --- Tests ---

describe('Event filtering', () => {
  it('includes timed confirmed events', () => {
    const events = [
      { id: '1', summary: 'Standup', start: { dateTime: '2026-06-30T10:00:00Z' }, status: 'confirmed' },
    ];
    assert.equal(filterEvents(events).length, 1);
  });

  it('excludes all-day events', () => {
    const events = [
      { id: '1', summary: 'Holiday', start: { date: '2026-06-30' }, status: 'confirmed' },
    ];
    assert.equal(filterEvents(events).length, 0);
  });

  it('excludes cancelled events', () => {
    const events = [
      { id: '1', summary: 'Cancelled', start: { dateTime: '2026-06-30T10:00:00Z' }, status: 'cancelled' },
    ];
    assert.equal(filterEvents(events).length, 0);
  });

  it('excludes declined events', () => {
    const events = [
      {
        id: '1',
        summary: 'Declined',
        start: { dateTime: '2026-06-30T10:00:00Z' },
        status: 'confirmed',
        attendees: [{ self: true, responseStatus: 'declined' }],
      },
    ];
    assert.equal(filterEvents(events).length, 0);
  });

  it('includes tentative events', () => {
    const events = [
      {
        id: '1',
        summary: 'Maybe',
        start: { dateTime: '2026-06-30T10:00:00Z' },
        status: 'confirmed',
        attendees: [{ self: true, responseStatus: 'tentative' }],
      },
    ];
    assert.equal(filterEvents(events).length, 1);
  });

  it('includes events without attendees (solo events)', () => {
    const events = [
      { id: '1', summary: 'Focus time', start: { dateTime: '2026-06-30T10:00:00Z' }, status: 'confirmed' },
    ];
    assert.equal(filterEvents(events).length, 1);
  });
});

describe('Deduplication', () => {
  beforeEach(() => {
    storage.local = {};
  });

  it('returns new events on first poll', async () => {
    const events = [
      { id: 'evt1', start: { dateTime: '2026-06-30T10:00:00Z' } },
      { id: 'evt2', start: { dateTime: '2026-06-30T10:30:00Z' } },
    ];
    const result = await dedup(events);
    assert.equal(result.length, 2);
  });

  it('filters already-notified events on subsequent polls', async () => {
    const events = [{ id: 'evt1', start: { dateTime: '2026-06-30T10:00:00Z' } }];
    await dedup(events);
    const result = await dedup(events);
    assert.equal(result.length, 0);
  });

  it('prunes entries older than 24 hours', async () => {
    storage.local.notifiedIds = {
      old: Date.now() - 90000000, // ~25 hours ago
      recent: Date.now() - 1000,
    };
    const events = [{ id: 'new1', start: { dateTime: '2026-06-30T10:00:00Z' } }];
    await dedup(events);
    assert.equal(storage.local.notifiedIds.old, undefined);
    assert.ok(storage.local.notifiedIds.recent);
    assert.ok(storage.local.notifiedIds.new1);
  });
});

describe('Truncation', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(truncate(null, 100), '');
    assert.equal(truncate(undefined, 100), '');
  });

  it('returns full string when under limit', () => {
    assert.equal(truncate('short', 100), 'short');
  });

  it('truncates with ellipsis when over limit', () => {
    const long = 'a'.repeat(150);
    const result = truncate(long, 100);
    assert.equal(result.length, 103); // 100 + '...'
    assert.ok(result.endsWith('...'));
  });
});

describe('Settings defaults', () => {
  beforeEach(() => {
    storage.local = {};
    storage.sync = {};
  });

  it('uses default enabled=true when not set', async () => {
    const result = await chrome.storage.local.get({ enabled: true });
    assert.equal(result.enabled, true);
  });

  it('uses default leadTimeMinutes=5 when not set', async () => {
    const result = await chrome.storage.sync.get({ leadTimeMinutes: 5 });
    assert.equal(result.leadTimeMinutes, 5);
  });

  it('persists changed settings', async () => {
    await chrome.storage.local.set({ enabled: false });
    const result = await chrome.storage.local.get({ enabled: true });
    assert.equal(result.enabled, false);
  });

  it('persists changed lead time', async () => {
    await chrome.storage.sync.set({ leadTimeMinutes: 10 });
    const result = await chrome.storage.sync.get({ leadTimeMinutes: 5 });
    assert.equal(result.leadTimeMinutes, 10);
  });
});
