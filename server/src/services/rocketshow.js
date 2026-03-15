const http = require('http');
const { getState, updateNested } = require('../core/state');
const settings = require('./settings');
const logger = require('../core/logger');

let pollTimer = null;
let rsHost = '127.0.0.1';
let rsPort = 8181;
let pollInterval = 500;
let afterPollCallback = null; // called after each successful poll

/**
 * Make an HTTP request to RocketShow API.
 */
function rsRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: rsHost,
      port: rsPort,
      path: `/api${path}`,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 3000,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : null);
        } catch {
          resolve(data);
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RocketShow request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Poll RocketShow state. Called on interval.
 *
 * Endpoint: GET /api/system/state
 *
 * Real RS response:
 * {
 *   "currentCompositionIndex": 0,
 *   "playState": "PLAYING",
 *   "currentCompositionName": "Example composition",
 *   "currentCompositionDurationMillis": 242744,
 *   "positionMillis": 224378
 * }
 */
async function poll() {
  try {
    const status = await rsRequest('GET', '/system/state');
    const wasConnected = getState().rocketshow.connected;

    if (!status || typeof status !== 'object') {
      updateNested('rocketshow', { connected: true });
      if (!wasConnected) {
        logger.info('rocketshow', `Connected to RocketShow at ${rsHost}:${rsPort} (no state data yet)`);
      }
      if (afterPollCallback) {
        try { afterPollCallback(); } catch (e) { /* ignore */ }
      }
      return;
    }

    // ── Parse fields from real RS response ──
    const playerState = mapPlayerState(status.playState || '');
    const positionMs = typeof status.positionMillis === 'number' ? status.positionMillis : 0;
    const durationMs = typeof status.currentCompositionDurationMillis === 'number'
      ? status.currentCompositionDurationMillis : 0;
    const currentComp = status.currentCompositionName || null;

    updateNested('rocketshow', {
      connected: true,
      playerState,
      positionMs,
      durationMs,
      currentComposition: currentComp,
    });

    if (!wasConnected) {
      logger.info('rocketshow', `Connected to RocketShow at ${rsHost}:${rsPort} — state: ${playerState}`);
    }

    // Notify playback manager after every successful poll
    if (afterPollCallback) {
      try { afterPollCallback(); } catch (e) { logger.error('rocketshow', `afterPoll error: ${e.message}`); }
    }
  } catch (err) {
    const wasConnected = getState().rocketshow.connected;
    updateNested('rocketshow', { connected: false });
    if (wasConnected) {
      logger.warn('rocketshow', `Lost connection to RocketShow: ${err.message}`);
    }
  }
}

function mapPlayerState(raw) {
  if (!raw) return 'STOPPED';
  const s = String(raw).toUpperCase();
  if (s.includes('PLAY')) return 'PLAYING';
  if (s.includes('PAUS')) return 'PAUSED';
  if (s.includes('LOAD')) return 'LOADING';
  if (s.includes('STOP')) return 'STOPPED';
  return s;
}

/**
 * Fetch all compositions from RocketShow.
 */
async function fetchCompositions() {
  try {
    const data = await rsRequest('GET', '/composition/list');
    const list = Array.isArray(data) ? data : (data?.compositions || []);
    updateNested('rocketshow', { compositions: list });
    return list;
  } catch (err) {
    logger.error('rocketshow', `Failed to fetch compositions: ${err.message}`);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════
// Transport commands
//
// Real RocketShow flow (observed via network inspection):
//   1. POST /api/transport/set-composition-name?name=<encoded>
//   2. POST /api/transport/play
// All parameters are QUERY PARAMS, not JSON body.
// ══════════════════════════════════════════════════════════════

/**
 * Set the active composition in RocketShow by name.
 * POST /api/transport/set-composition-name?name=<encoded>
 */
async function setCompositionName(name) {
  const encoded = encodeURIComponent(name);
  logger.info('rocketshow', `[TRANSPORT] set-composition-name: "${name}" → POST /api/transport/set-composition-name?name=${encoded}`);
  const result = await rsRequest('POST', `/transport/set-composition-name?name=${encoded}`);
  logger.info('rocketshow', `[TRANSPORT] set-composition-name response: ${JSON.stringify(result)}`);
  return result;
}

/**
 * Play a specific composition: set-composition-name + verify + play.
 * Reproduces the exact RocketShow native flow.
 */
async function playComposition(compositionName) {
  logger.info('rocketshow', `[TRANSPORT] ═══ playComposition("${compositionName}") ═══`);

  // Step 1: set-composition-name
  await setCompositionName(compositionName);

  // Step 2: verify via /system/state that RS loaded the right composition
  const state = await rsRequest('GET', '/system/state');
  const loadedComp = state?.currentCompositionName || '(null)';
  logger.info('rocketshow', `[TRANSPORT] verify after set: currentCompositionName="${loadedComp}" (expected="${compositionName}")`);
  if (loadedComp !== compositionName) {
    logger.warn('rocketshow', `[TRANSPORT] ⚠ composition mismatch! RS has "${loadedComp}" but we asked for "${compositionName}"`);
  }

  // Step 3: play
  logger.info('rocketshow', '[TRANSPORT] play → POST /api/transport/play');
  const result = await rsRequest('POST', '/transport/play');
  logger.info('rocketshow', `[TRANSPORT] play response: ${JSON.stringify(result)}`);
  logger.info('rocketshow', `[TRANSPORT] ═══ playComposition done ═══`);
  return result;
}

/**
 * Load a composition WITHOUT starting playback: set-composition-name + verify only.
 * Used by manual-mode "Next" to prepare the next song without auto-playing.
 */
async function loadComposition(compositionName) {
  logger.info('rocketshow', `[TRANSPORT] ═══ loadComposition("${compositionName}") (no play) ═══`);

  // Step 1: set-composition-name
  await setCompositionName(compositionName);

  // Step 2: verify
  const state = await rsRequest('GET', '/system/state');
  const loadedComp = state?.currentCompositionName || '(null)';
  logger.info('rocketshow', `[TRANSPORT] verify after set: currentCompositionName="${loadedComp}" (expected="${compositionName}")`);
  if (loadedComp !== compositionName) {
    logger.warn('rocketshow', `[TRANSPORT] ⚠ composition mismatch! RS has "${loadedComp}" but we asked for "${compositionName}"`);
  }

  logger.info('rocketshow', `[TRANSPORT] ═══ loadComposition done (NOT playing) ═══`);
}

/**
 * Simple play (resume current, no composition change).
 */
async function play() {
  logger.info('rocketshow', '[TRANSPORT] play/resume (no composition change)');
  return rsRequest('POST', '/transport/play');
}

async function pause() {
  logger.info('rocketshow', '[TRANSPORT] pause');
  return rsRequest('POST', '/transport/pause');
}

async function resume() {
  logger.info('rocketshow', '[TRANSPORT] resume → POST /api/transport/play');
  return rsRequest('POST', '/transport/play');
}

async function stop() {
  logger.info('rocketshow', '[TRANSPORT] stop');
  return rsRequest('POST', '/transport/stop');
}

async function seek(positionMs) {
  return rsRequest('POST', `/transport/seek?positionMillis=${positionMs}`);
}

async function next() {
  logger.info('rocketshow', '[TRANSPORT] next-composition');
  return rsRequest('POST', '/transport/next-composition');
}

/**
 * Start the poller.
 */
function start() {
  // Load settings from DB
  rsHost = settings.get('rocketshow_host') || '127.0.0.1';
  rsPort = parseInt(settings.get('rocketshow_port') || '8181', 10);
  pollInterval = parseInt(settings.get('polling_interval_ms') || '500', 10);

  logger.info('rocketshow', `Poller starting — ${rsHost}:${rsPort} every ${pollInterval}ms`);

  // Initial poll + fetch compositions
  poll();
  fetchCompositions();

  // Start interval
  pollTimer = setInterval(poll, pollInterval);
}

function stopPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    logger.info('rocketshow', 'Poller stopped');
  }
}

function restart() {
  stopPoller();
  start();
}

function isConnected() {
  return getState().rocketshow.connected;
}

/**
 * Register a callback to run after each poll (used by playback manager).
 */
function onAfterPoll(fn) {
  afterPollCallback = fn;
}

module.exports = {
  start,
  stop: stopPoller,
  restart,
  poll,
  fetchCompositions,
  isConnected,
  onAfterPoll,
  playComposition,
  loadComposition,
  transport: { play, pause, resume, stop, seek, next },
};
