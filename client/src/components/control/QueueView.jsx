import React, { useState, useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime, formatDuration } from '../../utils/format';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import Popup from '../shared/Popup';

/**
 * QueueView — full-page queue view.
 *
 * Drag/visual rules based on ACTUAL playback state:
 *  - is_current === 1 AND playerState PLAYING/PAUSED → pink, play icon, locked
 *  - Otherwise → normal display, draggable, removable
 *
 * Touch drag: handled via useTouchDrag hook (HTML5 drag doesn't work on mobile)
 */
export default function QueueView() {
  const { state } = useSocket();
  const queue = state.queue || [];
  const liveLock = state.liveLock;
  const playerState = state.rocketshow?.playerState || 'STOPPED';
  const [confirmClear, setConfirmClear] = useState(false);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  // Only locked when actually playing or paused — not just "next in line"
  const isLocked = (item) =>
    item.is_current === 1 && (playerState === 'PLAYING' || playerState === 'PAUSED');

  const pos0Locked = queue[0] && isLocked(queue[0]);

  // ── Touch drag (mobile) ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    console.log(`[QV] onMove callback — fromIdx=${fromIdx} toIdx=${toIdx}`);
    const item = queue[fromIdx];
    if (!item || item.is_current === 1) { console.log('[QV] onMove BLOCKED (locked item)'); return; }
    if (liveLock) { console.log('[QV] onMove BLOCKED (liveLock)'); return; }
    const safePos = pos0Locked && toIdx === 0 ? 1 : toIdx;
    if (safePos === fromIdx) { console.log('[QV] onMove SKIP (same position)'); return; }
    console.log(`[QV] onMove EXECUTING — id=${item.id} → pos=${safePos}`);
    api.post('/queue/move', { queueItemId: item.id, newPosition: safePos }).catch(() => {});
  }, [queue, liveLock, pos0Locked]));

  // ── HTML5 drag (desktop) ──
  const handleDragStart = (idx) => {
    const item = queue[idx];
    if (!item || isLocked(item)) return;
    dragItem.current = idx;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    dragOverItem.current = idx;
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    if (liveLock) return;

    const item = queue[dragItem.current];
    if (!item || isLocked(item)) return;

    const safePos = pos0Locked && dragOverItem.current === 0 ? 1 : dragOverItem.current;
    if (safePos === dragItem.current) { dragItem.current = null; dragOverItem.current = null; return; }

    api.post('/queue/move', {
      queueItemId: item.id,
      newPosition: safePos,
    }).catch(() => {});

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleRemove = (item) => {
    if (isLocked(item)) return;
    api.post('/queue/remove', { queueItemId: item.id }).catch(() => {});
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>
          File d'attente
          {queue.length > 0 && (
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 10 }}>
              {queue.length} titre{queue.length > 1 ? 's' : ''} — {formatDuration(queue.reduce((sum, q) => sum + (q.duration_ms || 0), 0))}
            </span>
          )}
        </h2>
        {!liveLock && queue.length > 0 && (
          <button className="btn btn-sm btn-secondary" onClick={() => setConfirmClear(true)}>
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
          <tbody data-drag-list={queue.length}>
            {queue.map((item, idx) => {
              const tags = tryParseJson(item.tags, []);
              const locked = isLocked(item);

              return (
                <tr
                  key={item.id}
                  className={locked ? 'current-song' : ''}
                  data-drag-idx={idx}
                  draggable={!locked && !liveLock}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  {...(!locked && !liveLock ? touchDrag.rowTouchHandlers(idx) : {})}
                >
                  <td>
                    {!locked && !liveLock && (
                      <span className="drag-handle">⠿</span>
                    )}
                    {locked && <span style={{ color: 'var(--current-song)', fontWeight: 700 }}>▶</span>}
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
                    {!locked && !liveLock && (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleRemove(item)}
                        title="Retirer"
                        style={{ color: 'var(--error)' }}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {confirmClear && (
        <Popup
          title="Voulez-vous vraiment vider la file d'attente ?"
          actions={[{ label: 'Vider', onClick: () => api.post('/queue/clear') }]}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

function tryParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : str || fallback; } catch { return fallback; }
}
