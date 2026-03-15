/**
 * Central in-memory state — single source of truth broadcast via Socket.IO.
 * Only the backend services mutate this state.
 */

const state = {
  // Session
  session: null, // { id, venue, opened_at } or null

  // RocketShow connection
  rocketshow: {
    connected: false,
    currentComposition: null,
    playerState: 'STOPPED', // STOPPED | PLAYING | PAUSED | LOADING
    positionMs: 0,
    durationMs: 0,
    compositions: [],
  },

  // Queue
  queue: [], // [{ id, song_id, title, artist, position, is_current, played }]

  // Playback
  playback: {
    mode: 'auto', // 'auto' | 'manual'
    currentSong: null, // { id, title, artist, duration_ms, rs_name, ... }
    syncMode: null, // null = normal, { songId, title, rsName } = sync editing active
  },

  // Live lock
  liveLock: false,

  // Stage message (prompter)
  stageMessage: '',

  // Prompter data
  prompter: {
    currentSong: null,
    nextSong: null,
    lyrics: [],
    syncCues: [],
    activeLine: -1,
    positionMs: 0,
    remainingMs: 0,
  },
};

// Listeners for state changes
const listeners = new Set();

function getState() {
  return state;
}

function updateState(partial) {
  Object.assign(state, partial);
  notifyListeners();
}

function updateNested(key, partial) {
  if (state[key] && typeof state[key] === 'object' && !Array.isArray(state[key])) {
    Object.assign(state[key], partial);
  } else {
    state[key] = partial;
  }
  notifyListeners();
}

function onStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners() {
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (err) {
      console.error('[state] Listener error:', err);
    }
  }
}

module.exports = { getState, updateState, updateNested, onStateChange };
