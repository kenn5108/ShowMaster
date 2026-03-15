const { Router } = require('express');
const history = require('../services/history');
const { getState } = require('../core/state');

const router = Router();

router.get('/', (req, res) => {
  const session = getState().session;
  if (!session) return res.json([]);
  res.json(history.getBySession(session.id));
});

// CSV export: all sessions (grouped by session with title rows)
router.get('/csv/all', (req, res) => {
  const rows = history.getAllForCsv();
  const csv = toCsvAll(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historique-complet.csv"');
  res.send('\uFEFF' + csv);
});

// CSV export: single session
router.get('/csv/:sessionId', (req, res) => {
  const sessionId = parseInt(req.params.sessionId);
  const rows = history.getBySessionForCsv(sessionId);
  const session = history.getSessionInfo(sessionId);
  const venue = session ? session.venue.replace(/[^a-zA-Z0-9àâéèêëïîôùûüç _-]/gi, '') : 'session';
  const csv = toCsvSession(rows, session);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="historique-${venue}.csv"`);
  res.send('\uFEFF' + csv);
});

router.get('/:sessionId', (req, res) => {
  res.json(history.getBySession(parseInt(req.params.sessionId)));
});

// Delete a single history entry
router.delete('/entry/:historyId', (req, res) => {
  try {
    history.deleteEntry(parseInt(req.params.historyId));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:sessionId', (req, res) => {
  history.clearBySession(parseInt(req.params.sessionId));
  res.json({ ok: true });
});

// ── CSV helpers ──

function toCsvSession(rows, session) {
  const lines = [];

  // Title row: "Venue - DD/MM/YYYY"
  if (session) {
    const dateStr = formatDateFr(session.opened_at);
    lines.push(csvEscape(`${session.venue} - ${dateStr}`));
    lines.push(''); // blank line
  }

  // Headers
  lines.push(['#', 'Titre', 'Artiste', 'Durée', 'Lecture'].join(';'));

  for (const r of rows) {
    lines.push([
      r.position + 1,
      csvEscape(r.title),
      csvEscape(r.artist || ''),
      r.duration_ms ? formatDurationCsv(r.duration_ms) : '',
      formatTimeFr(r.started_at),
    ].join(';'));
  }

  return lines.join('\r\n');
}

function toCsvAll(rows) {
  const lines = [];
  let currentVenue = null;

  for (const r of rows) {
    // Group header when session changes
    const sessionKey = `${r.venue}|${r.session_date}`;
    if (sessionKey !== currentVenue) {
      if (currentVenue !== null) lines.push(''); // blank between sessions
      const dateStr = formatDateFr(r.session_date);
      lines.push(csvEscape(`${r.venue} - ${dateStr}`));
      lines.push(''); // blank line
      lines.push(['#', 'Titre', 'Artiste', 'Durée', 'Lecture'].join(';'));
      currentVenue = sessionKey;
    }

    lines.push([
      r.position + 1,
      csvEscape(r.title),
      csvEscape(r.artist || ''),
      r.duration_ms ? formatDurationCsv(r.duration_ms) : '',
      formatTimeFr(r.started_at),
    ].join(';'));
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

function formatDateFr(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return iso;
  }
}

function formatTimeFr(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return iso;
  }
}

module.exports = router;
