import React, { useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useTouchDrag } from '../../hooks/useTouchDrag';

/**
 * QueuePanel — compact queue always visible in the right panel.
 *
 * Drag/visual rules based on ACTUAL playback state:
 *  - is_current === 1 AND playerState PLAYING/PAUSED → pink, play icon, locked
 *  - Otherwise → normal display, draggable, removable
 *
 * Touch drag: handled via useTouchDrag hook (HTML5 drag doesn't work on mobile)
 */
export default function QueuePanel() {
  const { state } = useSocket();
  const queue = state.queue || [];
  const liveLock = state.liveLock;
  const playerState = state.rocketshow?.playerState || 'STOPPED';
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  // Only locked when actually playing or paused — not just "next in line"
  const isLocked = (item) =>
    item.is_current === 1 && (playerState === 'PLAYING' || playerState === 'PAUSED');

  // ── Touch drag (mobile) ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    const item = queue[fromIdx];
    if (!item || item.is_current === 1) return;
    if (liveLock) return;
    api.post('/queue/move', { queueItemId: item.id, newPosition: toIdx }).catch(() => {});
  }, [queue, liveLock]));

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
    api.post('/queue/move', { queueItemId: item.id, newPosition: dragOverItem.current }).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleRemove = (item) => {
    if (isLocked(item) || liveLock) return;
    api.post('/queue/remove', { queueItemId: item.id }).catch(() => {});
  };

  return (
    <div className="queue-panel">
      <div className="queue-panel-header">
        <span className="queue-panel-title">File d'attente</span>
        <span className="queue-panel-count">{queue.length}</span>
        {!liveLock && queue.length > 1 && (
          <button className="queue-panel-clear" onClick={() => api.post('/queue/clear')}>
            Vider
          </button>
        )}
      </div>

      <div className="queue-panel-list">
        {queue.length === 0 ? (
          <div className="queue-panel-empty">
            Ajoutez des morceaux depuis la biblioth&egrave;que
          </div>
        ) : (
          queue.map((item, idx) => {
            const locked = isLocked(item);
            return (
              <div
                key={item.id}
                className={`queue-panel-item ${locked ? 'current' : ''}`}
                data-drag-idx={idx}
                draggable={!locked && !liveLock}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
              >
                <div className="queue-panel-item-index">
                  {locked ? (
                    <span className="queue-panel-playing-icon">▶</span>
                  ) : (
                    !liveLock && (
                      <span
                        className="drag-handle-sm"
                        onTouchStart={(e) => touchDrag.handleTouchStart(idx, e)}
                      >⠿</span>
                    )
                  )}
                  {!locked && liveLock && <span className="queue-panel-num">{idx + 1}</span>}
                </div>
                <div className="queue-panel-item-info">
                  <div className="queue-panel-item-title">{item.title}</div>
                  <div className="queue-panel-item-artist">{item.artist || ''}</div>
                </div>
                <div className="queue-panel-item-duration">{formatTime(item.duration_ms)}</div>
                {!locked && !liveLock && (
                  <button className="queue-panel-item-remove" onClick={() => handleRemove(item)}>✕</button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
