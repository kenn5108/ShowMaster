const { Router } = require('express');
const playlists = require('../services/playlists');

const router = Router();

router.get('/', (req, res) => {
  res.json(playlists.getAll());
});

router.get('/:id', (req, res) => {
  const pl = playlists.getById(parseInt(req.params.id));
  if (!pl) return res.status(404).json({ error: 'Playlist not found' });
  res.json(pl);
});

// Helper: broadcast playlist list to all clients after any mutation
function broadcastPlaylists(req) {
  const io = req.app.get('io');
  if (io) io.emit('playlists:changed', playlists.getAll());
}

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const pl = playlists.create(name);
  broadcastPlaylists(req);
  res.json(pl);
});

router.patch('/:id', (req, res) => {
  playlists.rename(parseInt(req.params.id), req.body.name);
  broadcastPlaylists(req);
  res.json(playlists.getById(parseInt(req.params.id)));
});

router.delete('/:id', (req, res) => {
  playlists.remove(parseInt(req.params.id));
  broadcastPlaylists(req);
  res.json({ ok: true });
});

router.post('/:id/move', (req, res) => {
  playlists.movePlaylist(parseInt(req.params.id), req.body.newPosition);
  broadcastPlaylists(req);
  res.json(playlists.getAll());
});

// Items
router.get('/:id/items', (req, res) => {
  const { sort = 'position', dir = 'asc' } = req.query;
  res.json(playlists.getItems(parseInt(req.params.id), sort, dir));
});

router.post('/:id/items', (req, res) => {
  const { songId } = req.body;
  playlists.addItem(parseInt(req.params.id), songId);
  res.json(playlists.getItems(parseInt(req.params.id)));
});

router.delete('/:playlistId/items/:itemId', (req, res) => {
  playlists.removeItem(parseInt(req.params.itemId));
  res.json(playlists.getItems(parseInt(req.params.playlistId)));
});

router.post('/:playlistId/items/:itemId/move', (req, res) => {
  playlists.moveItem(parseInt(req.params.itemId), req.body.newPosition);
  res.json(playlists.getItems(parseInt(req.params.playlistId)));
});

module.exports = router;
