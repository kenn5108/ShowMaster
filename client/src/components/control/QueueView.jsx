import React, { useCallback, useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';

export default function QueueView() {
  const { state } = useSocket();
  const queue = state.queue || [];
  const liveLock = state.liveLock;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const handleDragStart = (idx) => {
    if (idx === 0) return; // Can't drag current song
    dragItem.current = idx;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (idx === 0) return; // Can't drop on current
    dragOverItem.current = idx;
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    if (liveLock) return;

    const item = queue[dragItem.current];
    if (!item || item.is_current) return;

    api.post('/queue/move', {
      queueItemId: item.id,
      newPosition: dragOverItem.current,
    }).catch(() => {});

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleRemove = (item) => {
    if (item.is_current) return;
    api.post('/queue/remove', { queueItemId: item.id }).catch(() => {});
  };

  const handlePlayItem = (item) => {
    api.post('/playback/play', { queueItemId: item.id }).catch(() => {});
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>File d'attente</h2>
        {!liveLock && queue.length > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => api.post('/queue/clear')}>
            Vider la file
          </button>
        )}
      </div>

      {queue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          File vide — ajoutez des morceaux depuis la bibliothèque ou une playlist
        </div>
      ) : (
        <table className="song-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Titre</th>
              <th>Artiste</th>
              <th style={{ width: 70, textAlign: 'right' }}>Durée</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item, idx) => {
              const tags = tryParseJson(item.tags, []);
              const isCurrent = item.is_current === 1;

              return (
                <tr
                  key={item.id}
                  className={isCurrent ? 'current-song' : ''}
                  draggable={!isCurrent && !liveLock}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                >
                  <td>
                    {!isCurrent && !liveLock && (
                      <span className="drag-handle">⠿</span>
                    )}
                    {isCurrent && <span style={{ color: 'var(--current-song)', fontWeight: 700 }}>▶</span>}
                  </td>
                  <td>
                    <div className="song-title">{item.title}</div>
                    <div className="song-meta">
                      {tags.map((t, i) => <span key={i} className="badge">{t}</span>)}
                      {item.key_signature && <span className="badge badge-key">{item.key_signature}</span>}
                      {item.bpm && <span className="badge badge-bpm">{item.bpm} BPM</span>}
                    </div>
                  </td>
                  <td><span className="song-artist">{item.artist || '—'}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="song-duration">{formatTime(item.duration_ms)}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handlePlayItem(item)}
                        title="Jouer"
                      >
                        ▶
                      </button>
                      {!isCurrent && !liveLock && (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => handleRemove(item)}
                          title="Retirer"
                          style={{ color: 'var(--error)' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function tryParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : str || fallback; } catch { return fallback; }
}
