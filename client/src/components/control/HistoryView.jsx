import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useSocket } from '../../contexts/SocketContext';
import Popup from '../shared/Popup';

export default function HistoryView() {
  const { state } = useSocket();
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Load session list on mount
  useEffect(() => {
    api.get('/session/all').then(setSessions).catch(() => {});
  }, [state.session]);

  const openSession = async (session) => {
    setSelectedSession(session);
    setLoading(true);
    try {
      const data = await api.get(`/history/${session.id}`);
      setHistory(data);
    } catch {
      setHistory([]);
    }
    setLoading(false);
  };

  const handleAddToQueue = (songId, position) => {
    api.post('/queue/add', { songId, position }).catch(() => {});
  };

  const handleDeleteEntry = async (entry) => {
    try {
      await api.delete(`/history/entry/${entry.id}`);
      setHistory(prev => prev.filter(h => h.id !== entry.id));
    } catch {}
    setConfirmDelete(null);
  };

  const backToList = () => {
    setSelectedSession(null);
    setHistory([]);
  };

  // ── Session detail view ──
  if (selectedSession) {
    const isCurrent = state.session && state.session.id === selectedSession.id;

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button className="btn btn-sm btn-secondary" onClick={backToList}>
            &larr; Sessions
          </button>
          <h2 style={{ fontSize: 18, flex: 1, margin: 0 }}>
            {selectedSession.venue}
            {isCurrent && (
              <span style={{ fontSize: 11, color: 'var(--accent)', marginLeft: 8, fontWeight: 400 }}>
                en cours
              </span>
            )}
          </h2>
          {history.length > 0 && (
            <a
              className="btn btn-sm btn-secondary"
              href={`/api/history/csv/${selectedSession.id}`}
              download
              style={{ textDecoration: 'none' }}
            >
              CSV
            </a>
          )}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {formatDate(selectedSession.opened_at)}
          {selectedSession.closed_at && ` — ${formatDate(selectedSession.closed_at)}`}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Chargement...
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            Aucun morceau joué dans cette session
          </div>
        ) : (
          <table className="song-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Titre</th>
                <th>Artiste</th>
                <th style={{ width: 70, textAlign: 'right' }}>Durée</th>
                <th style={{ width: 60, textAlign: 'right' }}>Lecture</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, idx) => (
                <tr key={h.id}>
                  <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                  <td><div className="song-title">{h.title}</div></td>
                  <td><span className="song-artist">{h.artist || '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="song-duration">{formatTime(h.duration_ms)}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                    {formatHour(h.started_at)}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {state.session && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleAddToQueue(h.song_id, 'bottom')}
                        title="Remettre en file"
                        style={{ marginRight: 4 }}
                      >
                        +
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => setConfirmDelete(h)}
                      title="Supprimer de l'historique"
                      style={{ color: 'var(--error)' }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {confirmDelete && (
          <Popup
            title={`Supprimer « ${confirmDelete.title} » de l'historique ?`}
            actions={[
              { label: 'Supprimer', className: 'btn-danger', onClick: () => handleDeleteEntry(confirmDelete) },
            ]}
            onClose={() => setConfirmDelete(null)}
          />
        )}
      </div>
    );
  }

  // ── Session list view ──
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1, margin: 0 }}>Historique</h2>
        {sessions.length > 0 && (
          <a
            className="btn btn-sm btn-secondary"
            href="/api/history/csv/all"
            download
            style={{ textDecoration: 'none' }}
          >
            Tout exporter CSV
          </a>
        )}
      </div>

      {sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Aucune session enregistrée
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {sessions.map((s) => {
            const isCurrent = state.session && state.session.id === s.id;

            return (
              <div
                key={s.id}
                onClick={() => openSession(s)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  background: isCurrent ? 'rgba(233,69,96,0.08)' : 'var(--bg-card)',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  marginBottom: 4,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {s.venue}
                    {isCurrent && (
                      <span style={{
                        fontSize: 10,
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: 4,
                        padding: '1px 6px',
                        fontWeight: 600,
                      }}>
                        EN COURS
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {formatDate(s.opened_at)}
                    {s.closed_at && ` — ${formatDate(s.closed_at)}`}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {s.song_count} titre{s.song_count !== 1 ? 's' : ''}
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>&rsaquo;</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatHour(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
