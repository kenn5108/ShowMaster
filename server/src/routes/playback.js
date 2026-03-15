const { Router } = require('express');
const playback = require('../services/playback');
const { getState } = require('../core/state');
const logger = require('../core/logger');

const router = Router();

router.get('/state', (req, res) => {
  const state = getState();
  res.json({
    playback: state.playback,
    rocketshow: state.rocketshow,
  });
});

// Transport commands — always allowed (even in live lock)
router.post('/play', async (req, res) => {
  try {
    logger.info('route:playback', `[POST /play] body=${JSON.stringify(req.body)}`);
    if (req.body.queueItemId) {
      await playback.playQueueItem(req.body.queueItemId);
    } else {
      await playback.play();
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error('route:playback', `[POST /play] error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.post('/pause', async (req, res) => {
  try {
    await playback.pause();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/stop', async (req, res) => {
  try {
    await playback.stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/next', async (req, res) => {
  try {
    await playback.next();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/seek', async (req, res) => {
  try {
    await playback.seek(req.body.positionMs);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Load a composition by songId for sync editing (bypasses the queue).
 * Only allowed when transport is STOPPED or PAUSED.
 */
router.post('/load-for-sync', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    const rs = getState().rocketshow;
    if (rs.playerState === 'PLAYING') {
      return res.status(409).json({ error: 'Cannot load for sync while playing' });
    }

    await playback.loadForSync(songId);
    res.json({ ok: true });
  } catch (err) {
    logger.error('route:playback', `[POST /load-for-sync] error: ${err.message}`);
    res.status(400).json({ error: err.message });
  }
});

router.post('/mode', (req, res) => {
  try {
    playback.setMode(req.body.mode);
    req.app.get('io').emit('state:update', { playback: getState().playback });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
