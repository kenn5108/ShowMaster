const { Router } = require('express');
const playback = require('../services/playback');
const { getState } = require('../core/state');

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
    if (req.body.queueItemId) {
      await playback.playQueueItem(req.body.queueItemId);
    } else {
      await playback.play();
    }
    res.json({ ok: true });
  } catch (err) {
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
