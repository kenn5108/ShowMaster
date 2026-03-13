const { Router } = require('express');
const history = require('../services/history');
const { getState } = require('../core/state');

const router = Router();

router.get('/', (req, res) => {
  const session = getState().session;
  if (!session) return res.json([]);
  res.json(history.getBySession(session.id));
});

router.get('/:sessionId', (req, res) => {
  res.json(history.getBySession(parseInt(req.params.sessionId)));
});

router.delete('/:sessionId', (req, res) => {
  history.clearBySession(parseInt(req.params.sessionId));
  res.json({ ok: true });
});

module.exports = router;
