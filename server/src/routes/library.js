const { Router } = require('express');
const library = require('../services/library');
const rocketshow = require('../services/rocketshow');
const { getState } = require('../core/state');

const router = Router();

router.get('/', (req, res) => {
  const { sort = 'title', dir = 'asc', q } = req.query;
  if (q) {
    res.json(library.search(q));
  } else {
    res.json(library.getAll(sort, dir));
  }
});

router.get('/:id', (req, res) => {
  const song = library.getById(parseInt(req.params.id));
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(song);
});

router.patch('/:id', (req, res) => {
  library.update(parseInt(req.params.id), req.body);
  const song = library.getById(parseInt(req.params.id));
  res.json(song);
});

router.post('/sync', async (req, res) => {
  try {
    const compositions = await rocketshow.fetchCompositions();
    const result = library.syncFromRocketShow(compositions);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/reassociate', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    const { newSongId } = req.body;
    if (!newSongId) return res.status(400).json({ error: 'newSongId required' });
    const song = library.reassociate(parseInt(req.params.id), newSongId);
    res.json(song);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    if (getState().liveLock) {
      return res.status(403).json({ error: 'Live lock is active' });
    }
    library.deleteSong(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
