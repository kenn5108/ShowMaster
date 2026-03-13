const { Router } = require('express');
const lyrics = require('../services/lyrics');

const router = Router();

router.get('/:songId', (req, res) => {
  const songId = parseInt(req.params.songId);
  res.json(lyrics.get(songId));
});

router.put('/:songId', (req, res) => {
  const songId = parseInt(req.params.songId);
  lyrics.save(songId, req.body.text || '');
  res.json(lyrics.get(songId));
});

router.get('/:songId/cues', (req, res) => {
  const songId = parseInt(req.params.songId);
  res.json(lyrics.getCues(songId));
});

router.put('/:songId/cues', (req, res) => {
  const songId = parseInt(req.params.songId);
  lyrics.saveCues(songId, req.body.cues || []);
  res.json(lyrics.getCues(songId));
});

module.exports = router;
