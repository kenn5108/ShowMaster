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
let debugLogCount = 0;

async function poll() {
  try {
    const status = await rsRequest('GET', '/system/state');
    const wasConnected = getState().rocketshow.connected;

    // Debug: log raw JSON on first 5 polls
    if (debugLogCount < 5 && status) {
      logger.info('rocketshow', `[DEBUG] Raw RS /api/system/state: ${JSON.stringify(status)}`);
      debugLogCount++;
    }

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

// Transport commands
async function play(compositionName) {
  if (compositionName) {
    return rsRequest('POST', '/transport/play', { compositionName });
  }
  return rsRequest('POST', '/transport/play');
}

async function pause() {
  return rsRequest('POST', '/transport/pause');
}

async function resume() {
  return rsRequest('POST', '/transport/play');
}

async function stop() {
  return rsRequest('POST', '/transport/stop');
}

async function seek(positionMs) {
  return rsRequest('POST', '/transport/seek', { positionMillis: positionMs });
}

async function next() {
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
  transport: { play, pause, resume, stop, seek, next },
};
