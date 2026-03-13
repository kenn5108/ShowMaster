const { Router } = require('express');
const queue = require('../services/queue');
const { getState } = require('../core/state');

const router = Router();

router.get('/', (req, res) => {
  res.json(getState().queue);
});

router.post('/add', (req, res) => {
  try {
    const { songId, position = 'bottom' } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    // Adding to queue is allowed even in live lock
    const q = queue.add(songId, position);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/remove', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    const { queueItemId } = req.body;
    const q = queue.remove(queueItemId);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/move', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    const { queueItemId, newPosition } = req.body;
    const q = queue.move(queueItemId, newPosition);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/clear', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    const q = queue.clear(req.body.keepCurrent !== false);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/load-playlist', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    const { playlistId } = req.body;
    const q = queue.loadFromPlaylist(playlistId);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
