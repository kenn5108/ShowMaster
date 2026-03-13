import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useSocket } from '../../contexts/SocketContext';

export default function HistoryView() {
  const { state } = useSocket();
  const [history, setHistory] = useState([]);

  useEffect(() => {
    api.get('/history').then(setHistory).catch(() => {});
  }, [state.session]);

  const handleAddToQueue = (songId, position) => {
    api.post('/queue/add', { songId, position }).catch(() => {});
  };

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Historique</h2>

      {history.length === 0 ? (
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
              <th style={{ width: 60 }}></th>
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
                <td>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleAddToQueue(h.song_id, 'bottom')}
                    title="Remettre en file"
                  >
                    +
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
