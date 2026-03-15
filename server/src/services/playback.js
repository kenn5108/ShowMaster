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
    logger.info('playback', `[POLL] ── RS composition changed: "${lastComposition}" → "${currentComp}"`);
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
  // In sync mode, don't update currentSong / history — we're just editing
  if (getState().playback.syncMode) {
    logger.info('playback', `[POLL] ── Sync mode: ignoring onSongStart for "${compositionName}"`);
    return;
  }

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
  // In sync mode, song end = just stop, no queue advance
  if (getState().playback.syncMode) {
    logger.info('playback', '[SYNC] ── Song ended during sync mode. No queue advance.');
    return;
  }

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
    // Manual mode: advance queue (remove finished song, promote next) and load next without playing
    logger.info('playback', 'Manual mode — song ended, advancing queue without auto-play.');
    prepareNext();
  }
}

/**
 * Play a specific queue item.
 * Uses the real RS flow: set-composition-name → verify → play
 */
async function playQueueItem(queueItemId) {
  const state = getState();
  const item = state.queue.find(q => q.id === queueItemId);
  if (!item) throw new Error('Queue item not found');

  logger.info('playback', `[PLAY-ITEM] ── queue item id=${item.id}, song_id=${item.song_id}, title="${item.title}", rs_name="${item.rs_name}"`);

  queue.setCurrent(queueItemId);
  logger.info('playback', `[PLAY-ITEM] ── setCurrent done, now calling rocketshow.playComposition("${item.rs_name}")`);

  await rocketshow.playComposition(item.rs_name);

  songEndHandled = false;
  logger.info('playback', `[PLAY-ITEM] ── done.`);
}

/**
 * Play the first item in queue (if not already playing).
 * Uses the real RS flow: set-composition-name → verify → play
 */
async function playFirst() {
  const q = getState().queue;
  if (q.length === 0) throw new Error('Queue is empty');

  const first = q[0];
  logger.info('playback', `[PLAY-FIRST] ── queue[0] id=${first.id}, song_id=${first.song_id}, title="${first.title}", rs_name="${first.rs_name}"`);

  queue.setCurrent(first.id);
  await rocketshow.playComposition(first.rs_name);
  songEndHandled = false;
  logger.info('playback', `[PLAY-FIRST] ── done.`);
}

/**
 * Advance to next song in queue.
 * Uses the real RS flow: set-composition-name → verify → play
 */
async function advanceToNext() {
  const nextItem = queue.advance();
  if (nextItem) {
    logger.info('playback', `[ADVANCE] ── next item id=${nextItem.id}, song_id=${nextItem.song_id}, title="${nextItem.title}", rs_name="${nextItem.rs_name}"`);
    await rocketshow.playComposition(nextItem.rs_name);
    songEndHandled = false;
    logger.info('playback', `[ADVANCE] ── Advanced to: ${nextItem.title}`);
  } else {
    updateNested('playback', { currentSong: null });
    logger.info('playback', '[ADVANCE] ── Queue exhausted. Playback stopped.');
  }
}

async function play() {
  const s = getState();
  const rs = s.rocketshow;

  // ── Sync mode: just play the already-loaded composition ──
  if (s.playback.syncMode) {
    if (rs.playerState === 'PAUSED') {
      await rocketshow.transport.resume();
    } else {
      await rocketshow.transport.play();
    }
    songEndHandled = false;
    logger.info('playback', '[PLAY] ── Sync mode: playing loaded composition.');
    return;
  }

  // ── Normal mode ──
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
  // Set guard BEFORE the await to prevent race with poll cycle
  songEndHandled = true;
  await rocketshow.transport.stop();
  // IMPORTANT: do NOT clear is_current or currentSong.
  // Stop = pure stop. The song stays at the head of the queue,
  // still marked as current, ready to be replayed with Play.
  // The frontend uses playerState to distinguish PLAYING from STOPPED.
  logger.info('playback', '[STOP] ── Stopped. Song stays in queue as current.');
}

async function next() {
  // ── Sync mode: next is a no-op ──
  if (getState().playback.syncMode) {
    logger.info('playback', '[NEXT] ── Sync mode active, ignoring next.');
    return;
  }

  const state = getState();
  const mode = state.playback.mode;
  const playerState = state.rocketshow.playerState;
  songEndHandled = true; // set guard BEFORE await to prevent race with poll

  if (playerState === 'PLAYING') {
    // ── Transport is actively playing: stop first, then branch on mode ──
    await rocketshow.transport.stop();

    if (mode === 'auto') {
      // Auto + playing: advance and start playing immediately
      await advanceToNext();
    } else {
      // Manual + playing: advance, load next, don't play
      await prepareNext();
    }
  } else {
    // ── Transport is STOPPED or PAUSED: preparatory advance only ──
    // Regardless of mode, just remove head and prepare next without playing.
    // Auto mode only triggers autoplay while actively PLAYING.
    if (playerState === 'PAUSED') {
      await rocketshow.transport.stop();
    }
    await skipWhileStopped();
  }
}

/**
 * Skip while transport is STOPPED.
 * Removes the head of queue (whether is_current or not) and loads the next one.
 * Does NOT start playback. Works in both auto and manual mode.
 */
async function skipWhileStopped() {
  const currentQueue = getState().queue;
  if (currentQueue.length === 0) {
    logger.info('playback', '[SKIP-STOPPED] ── Queue empty, nothing to skip.');
    return;
  }

  const head = currentQueue[0];
  logger.info('playback', `[SKIP-STOPPED] ── Removing head: id=${head.id}, title="${head.title}" (is_current=${head.is_current})`);

  // Remove head item directly (bypass advance() which requires is_current=1)
  queue.removeHead();

  // Clear playback state since the current song is gone
  updateNested('playback', { currentSong: null });

  // Load next if available
  const newQueue = getState().queue;
  if (newQueue.length > 0) {
    const next = newQueue[0];
    logger.info('playback', `[SKIP-STOPPED] ── Loading next: id=${next.id}, title="${next.title}", rs_name="${next.rs_name}"`);
    await rocketshow.loadComposition(next.rs_name);
    logger.info('playback', `[SKIP-STOPPED] ── Prepared (not playing): ${next.title}`);
  } else {
    logger.info('playback', '[SKIP-STOPPED] ── Queue exhausted after skip.');
  }
}

/**
 * Advance queue and load next composition WITHOUT playing.
 * Used by manual-mode "Next" button when transport is active.
 */
async function prepareNext() {
  // advance(false): remove played song, promote next, but do NOT mark is_current
  // The next song stays visually normal and draggable until actually started.
  const nextItem = queue.advance(false);
  if (nextItem) {
    logger.info('playback', `[PREPARE-NEXT] ── next item id=${nextItem.id}, song_id=${nextItem.song_id}, title="${nextItem.title}", rs_name="${nextItem.rs_name}"`);
    await rocketshow.loadComposition(nextItem.rs_name);

    // Clear currentSong — the song is loaded in RS but NOT playing
    updateNested('playback', { currentSong: null });
    songEndHandled = true; // RS is stopped, don't trigger onSongEnd
    logger.info('playback', `[PREPARE-NEXT] ── Loaded (not playing): ${nextItem.title}`);
  } else {
    updateNested('playback', { currentSong: null });
    logger.info('playback', '[PREPARE-NEXT] ── Queue exhausted.');
  }
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

/**
 * Enter sync mode: load the song's composition and activate sync isolation.
 * While active, play/pause/stop act on this composition only; queue is bypassed.
 */
async function enterSyncMode(songId) {
  const song = library.getById(songId);
  if (!song) throw new Error(`Song #${songId} not found`);
  if (!song.rs_name) throw new Error(`Song #${songId} has no rs_name`);

  logger.info('playback', `[SYNC-ENTER] ── Entering sync mode for song #${songId}: "${song.title}" (rs_name="${song.rs_name}")`);
  await rocketshow.loadComposition(song.rs_name);
  songEndHandled = true;
  updateNested('playback', { syncMode: { songId: song.id, title: song.title, artist: song.artist || null, rsName: song.rs_name } });
  logger.info('playback', `[SYNC-ENTER] ── Sync mode active.`);
}

/**
 * Exit sync mode: stop playback if active, clear syncMode flag.
 * Queue-based playback resumes after this.
 */
async function exitSyncMode() {
  const rs = getState().rocketshow;
  if (rs.playerState === 'PLAYING' || rs.playerState === 'PAUSED') {
    songEndHandled = true;
    await rocketshow.transport.stop();
  }
  updateNested('playback', { syncMode: null });
  logger.info('playback', '[SYNC-EXIT] ── Sync mode deactivated. Normal playback resumed.');
}

// Keep loadForSync as alias for backward compat (route uses it)
async function loadForSync(songId) {
  await enterSyncMode(songId);
}

module.exports = { init, onPollUpdate, play, pause, stop, next, seek, playQueueItem, playFirst, advanceToNext, setMode, loadForSync, enterSyncMode, exitSyncMode };
