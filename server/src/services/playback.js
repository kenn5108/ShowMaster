const { getState, updateNested, updateState } = require('../core/state');
const rocketshow = require('./rocketshow');
const queue = require('./queue');
const library = require('./library');
const history = require('./history');
const settings = require('./settings');
const logger = require('../core/logger');

let lastPlayerState = 'STOPPED';
let lastComposition = null;
let songEndHandled = false; // guard against repeated onSongEnd calls

/**
 * PlaybackManager — orchestrates playback between Queue and RocketShow.
 *
 * Modes:
 *  - auto: when a song finishes, automatically advance to next in queue
 *  - manual: when a song finishes, stop and wait for user action
 */

function init() {
  const mode = settings.get('playback_mode') || 'auto';
  updateNested('playback', { mode });
  logger.info('playback', `Playback mode: ${mode}`);
}

/**
 * Called by the poll cycle to detect state transitions.
 */
function onPollUpdate() {
  const rs = getState().rocketshow;
  const currentState = rs.playerState;
  const currentComp = rs.currentComposition;

  // Detect song end: was PLAYING, now STOPPED — fire only once
  if (lastPlayerState === 'PLAYING' && currentState === 'STOPPED' && !songEndHandled) {
    songEndHandled = true;
    onSongEnd();
  }

  // Reset the guard when RS starts playing again
  if (currentState === 'PLAYING') {
    songEndHandled = false;
  }

  // Detect song change
  if (currentComp && currentComp !== lastComposition) {
    onSongStart(currentComp);
    songEndHandled = false; // new song started, allow end detection again
  }

  // Update prompter position
  updateNested('prompter', {
    positionMs: rs.positionMs,
    remainingMs: Math.max(0, rs.durationMs - rs.positionMs),
  });

  lastPlayerState = currentState;
  lastComposition = currentComp;
}

function onSongStart(compositionName) {
  const song = library.getByRsName(compositionName);
  if (song) {
    updateNested('playback', { currentSong: song });
    // Record in history
    const session = getState().session;
    if (session) {
      history.recordStart(session.id, song.id);
    }
    logger.info('playback', `Now playing: ${song.title} - ${song.artist}`);
  }
}

function onSongEnd() {
  const currentSong = getState().playback.currentSong;
  if (currentSong) {
    const session = getState().session;
    if (session) {
      history.recordEnd(session.id, currentSong.id);
    }
    logger.info('playback', `Song ended: ${currentSong.title}`);
  }

  const mode = getState().playback.mode;
  if (mode === 'auto') {
    advanceToNext();
  } else {
    updateNested('playback', { currentSong: null });
    logger.info('playback', 'Manual mode — waiting for user action.');
  }
}

/**
 * Play a specific queue item.
 */
async function playQueueItem(queueItemId) {
  const state = getState();
  const item = state.queue.find(q => q.id === queueItemId);
  if (!item) throw new Error('Queue item not found');

  queue.setCurrent(queueItemId);
  await rocketshow.transport.play(item.rs_name);
  songEndHandled = false;
  logger.info('playback', `Playing queue item: ${item.title}`);
}

/**
 * Play the first item in queue (if not already playing).
 */
async function playFirst() {
  const q = getState().queue;
  if (q.length === 0) throw new Error('Queue is empty');

  const first = q[0];
  queue.setCurrent(first.id);
  await rocketshow.transport.play(first.rs_name);
  songEndHandled = false;
}

/**
 * Advance to next song in queue.
 */
async function advanceToNext() {
  const nextItem = queue.advance();
  if (nextItem) {
    await rocketshow.transport.play(nextItem.rs_name);
    songEndHandled = false;
    logger.info('playback', `Advanced to: ${nextItem.title}`);
  } else {
    updateNested('playback', { currentSong: null });
    logger.info('playback', 'Queue exhausted. Playback stopped.');
  }
}

async function play() {
  const rs = getState().rocketshow;
  if (rs.playerState === 'PAUSED') {
    await rocketshow.transport.resume();
  } else {
    await playFirst();
  }
}

async function pause() {
  await rocketshow.transport.pause();
}

async function stop() {
  await rocketshow.transport.stop();
  songEndHandled = true; // manual stop, don't trigger onSongEnd
  updateNested('playback', { currentSong: null });
}

async function next() {
  await rocketshow.transport.stop();
  songEndHandled = true; // manual next, we handle advance ourselves
  await advanceToNext();
}

async function seek(positionMs) {
  await rocketshow.transport.seek(positionMs);
}

function setMode(mode) {
  if (mode !== 'auto' && mode !== 'manual') throw new Error('Invalid mode');
  settings.set('playback_mode', mode);
  updateNested('playback', { mode });
  logger.info('playback', `Mode changed to: ${mode}`);
}

module.exports = { init, onPollUpdate, play, pause, stop, next, seek, playQueueItem, playFirst, advanceToNext, setMode };
