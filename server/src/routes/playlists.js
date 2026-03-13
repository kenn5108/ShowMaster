const { Router } = require('express');
const playlists = require('../services/playlists');
const { getState } = require('../core/state');

const router = Router();

function checkLock(req, res) {
  if (getState().liveLock) {
    res.status(403).json({ error: 'Live lock is active' });
    return true;
  }
  return false;
}

router.get('/', (req, res) => {
  res.json(playlists.getAll());
});

router.get('/:id', (req, res) => {
  const pl = playlists.getById(parseInt(req.params.id));
  if (!pl) return res.status(404).json({ error: 'Playlist not found' });
  res.json(pl);
});

router.post('/', (req, res) => {
  if (checkLock(req, res)) return;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const pl = playlists.create(name);
  res.json(pl);
});

router.patch('/:id', (req, res) => {
  if (checkLock(req, res)) return;
  playlists.rename(parseInt(req.params.id), req.body.name);
  res.json(playlists.getById(parseInt(req.params.id)));
});

router.delete('/:id', (req, res) => {
  if (checkLock(req, res)) return;
  playlists.remove(parseInt(req.params.id));
  res.json({ ok: true });
});

// Items
router.get('/:id/items', (req, res) => {
  const { sort = 'position', dir = 'asc' } = req.query;
  res.json(playlists.getItems(parseInt(req.params.id), sort, dir));
});

router.post('/:id/items', (req, res) => {
  if (checkLock(req, res)) return;
  const { songId } = req.body;
  playlists.addItem(parseInt(req.params.id), songId);
  res.json(playlists.getItems(parseInt(req.params.id)));
});

router.delete('/:playlistId/items/:itemId', (req, res) => {
  if (checkLock(req, res)) return;
  playlists.removeItem(parseInt(req.params.itemId));
  res.json(playlists.getItems(parseInt(req.params.playlistId)));
});

router.post('/:playlistId/items/:itemId/move', (req, res) => {
  if (checkLock(req, res)) return;
  playlists.moveItem(parseInt(req.params.itemId), req.body.newPosition);
  res.json(playlists.getItems(parseInt(req.params.playlistId)));
});

module.exports = router;
