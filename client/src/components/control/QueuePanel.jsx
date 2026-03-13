import React, { useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';

/**
 * QueuePanel — compact queue always visible in the right panel.
 * Shows current song highlighted, drag & drop reorder, remove buttons.
 */
export default function QueuePanel() {
  const { state } = useSocket();
  const queue = state.queue || [];
  const liveLock = state.liveLock;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const handleDragStart = (idx) => {
    if (idx === 0) return;
    dragItem.current = idx;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (idx === 0) return;
    dragOverItem.current = idx;
  };

  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    if (liveLock) return;
    const item = queue[dragItem.current];
    if (!item || item.is_current) return;
    api.post('/queue/move', { queueItemId: item.id, newPosition: dragOverItem.current }).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleRemove = (item) => {
    if (item.is_current || liveLock) return;
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
            Ajoutez des morceaux depuis la bibliothèque
          </div>
        ) : (
          queue.map((item, idx) => {
            const isCurrent = item.is_current === 1;
            return (
              <div
                key={item.id}
                className={`queue-panel-item ${isCurrent ? 'current' : ''}`}
                draggable={!isCurrent && !liveLock}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
              >
                <div className="queue-panel-item-index">
                  {isCurrent ? (
                    <span className="queue-panel-playing-icon">▶</span>
                  ) : (
                    !liveLock && <span className="drag-handle-sm">⠿</span>
                  )}
                  {!isCurrent && liveLock && <span className="queue-panel-num">{idx}</span>}
                </div>
                <div className="queue-panel-item-info">
                  <div className="queue-panel-item-title">{item.title}</div>
                  <div className="queue-panel-item-artist">{item.artist || ''}</div>
                </div>
                <div className="queue-panel-item-duration">{formatTime(item.duration_ms)}</div>
                {!isCurrent && !liveLock && (
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
