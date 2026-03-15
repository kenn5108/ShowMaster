const { Router } = require('express');
const session = require('../services/session');

const router = Router();

router.get('/', (req, res) => {
  const current = session.getCurrent();
  res.json({ session: current });
});

router.get('/all', (req, res) => {
  res.json(session.getAll());
});

router.post('/open', (req, res) => {
  try {
    const { venue } = req.body;
    if (!venue || !venue.trim()) {
      return res.status(400).json({ error: 'Venue is required' });
    }
    const s = session.open(venue);
    req.app.get('io').emit('state:update', { session: s });
    res.json({ session: s });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/close', (req, res) => {
  try {
    session.close();
    req.app.get('io').emit('state:update', { session: null });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
