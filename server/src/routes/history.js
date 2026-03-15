const { Router } = require('express');
const history = require('../services/history');
const { getState } = require('../core/state');

const router = Router();

router.get('/', (req, res) => {
  const session = getState().session;
  if (!session) return res.json([]);
  res.json(history.getBySession(session.id));
});

// CSV export: all sessions
router.get('/csv/all', (req, res) => {
  const rows = history.getAllForCsv();
  const csv = toCsv(rows, true);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historique-complet.csv"');
  res.send('\uFEFF' + csv); // BOM for Excel
});

// CSV export: single session
router.get('/csv/:sessionId', (req, res) => {
  const rows = history.getBySessionForCsv(parseInt(req.params.sessionId));
  const csv = toCsv(rows, false);
  const venue = rows.length > 0 ? rows[0].venue.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç _-]/gi, '') : 'session';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="historique-${venue}.csv"`);
  res.send('\uFEFF' + csv);
});

router.get('/:sessionId', (req, res) => {
  res.json(history.getBySession(parseInt(req.params.sessionId)));
});

router.delete('/:sessionId', (req, res) => {
  history.clearBySession(parseInt(req.params.sessionId));
  res.json({ ok: true });
});

function toCsv(rows, includeSession) {
  const headers = ['#', 'Titre', 'Artiste', 'Durée', 'Début', 'Fin'];
  if (includeSession) headers.push('Session', 'Date session');

  const lines = [headers.join(';')];
  for (const r of rows) {
    const duration = r.duration_ms ? formatDurationCsv(r.duration_ms) : '';
    const cols = [
      r.position + 1,
      csvEscape(r.title),
      csvEscape(r.artist || ''),
      duration,
      r.started_at || '',
      r.finished_at || '',
    ];
    if (includeSession) {
      cols.push(csvEscape(r.venue || ''), r.session_date || '');
    }
    lines.push(cols.join(';'));
  }
  return lines.join('\r\n');
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatDurationCsv(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

module.exports = router;
