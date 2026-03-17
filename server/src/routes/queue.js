const { Router } = require('express');
const queue = require('../services/queue');

const router = Router();

router.get('/', (req, res) => {
  res.json(getState().queue);
});

router.post('/add', (req, res) => {
  try {
    const { songId, position = 'bottom' } = req.body;
    if (!songId) return res.status(400).json({ error: 'songId required' });

    const q = queue.add(songId, position);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/add-batch', (req, res) => {
  try {
    const { songIds, position = 'bottom' } = req.body;
    if (!Array.isArray(songIds) || songIds.length === 0) {
      return res.status(400).json({ error: 'songIds array required' });
    }
    const q = queue.addBatch(songIds, position);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/remove', (req, res) => {
  try {
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
    const q = queue.clear(req.body.keepCurrent !== false);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/load-playlist', (req, res) => {
  try {
    const { playlistId } = req.body;
    const q = queue.loadFromPlaylist(playlistId);
    req.app.get('io').emit('state:update', { queue: q });
    res.json(q);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
