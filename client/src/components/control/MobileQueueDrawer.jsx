import React, { useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useTouchDrag } from '../../hooks/useTouchDrag';

/**
 * MobileQueueDrawer — bottom sheet that slides up over the mobile transport bar.
 * Shows the full queue with drag-to-reorder and remove.
 * Closes via overlay tap, swipe-down handle, or close button.
 */
export default function MobileQueueDrawer({ open, onClose }) {
  const { state } = useSocket();
  const queue = state.queue || [];
  const liveLock = state.liveLock;
  const syncMode = !!state.playback?.syncMode;
  const playerState = state.rocketshow?.playerState || 'STOPPED';
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  const isLocked = (item) =>
    item.is_current === 1 && (playerState === 'PLAYING' || playerState === 'PAUSED');

  // ── Touch drag ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    const item = queue[fromIdx];
    if (!item || item.is_current === 1) return;
    if (liveLock) return;
    api.post('/queue/move', { queueItemId: item.id, newPosition: toIdx }).catch(() => {});
  }, [queue, liveLock]));

  // ── HTML5 drag fallback ──
  const handleDragStart = (idx) => {
    const item = queue[idx];
    if (!item || isLocked(item)) return;
    dragItem.current = idx;
  };
  const handleDragOver = (e, idx) => { e.preventDefault(); dragOverItem.current = idx; };
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
    <>
      {/* Overlay — tap to close */}
      {open && <div className="mobile-drawer-overlay" onClick={onClose} />}

      <div className={`mobile-drawer ${open ? 'open' : ''}`}>
        {/* Drag handle bar to close */}
        <div className="mobile-drawer-handle" onClick={onClose}>
          <div className="mobile-drawer-handle-bar" />
        </div>

        {/* Header */}
        <div className="mobile-drawer-header">
          <span className="mobile-drawer-title">File d'attente</span>
          {syncMode && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)', marginLeft: 8 }}>SYNCHRO</span>}
          <span className="mobile-drawer-count">{queue.length}</span>
          {!liveLock && queue.length > 1 && (
            <button
              className="mobile-drawer-clear"
              onClick={() => api.post('/queue/clear')}
            >
              Vider
            </button>
          )}
          <button className="mobile-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Queue list */}
        <div className="mobile-drawer-list" style={syncMode ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
          {queue.length === 0 ? (
            <div className="mobile-drawer-empty">
              Ajoutez des morceaux depuis la bibliothèque
            </div>
          ) : (
            queue.map((item, idx) => {
              const locked = isLocked(item);
              return (
                <div
                  key={item.id}
                  className={`mobile-drawer-item ${locked ? 'current' : ''}`}
                  data-drag-idx={idx}
                  draggable={!locked && !liveLock}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                >
                  <div className="mobile-drawer-item-handle">
                    {locked ? (
                      <span className="mobile-drawer-playing-icon">▶</span>
                    ) : (
                      !liveLock && (
                        <span
                          className="drag-handle"
                          onTouchStart={(e) => touchDrag.handleTouchStart(idx, e)}
                        >⠿</span>
                      )
                    )}
                    {!locked && liveLock && <span className="mobile-drawer-num">{idx + 1}</span>}
                  </div>
                  <div className="mobile-drawer-item-info">
                    <div className="mobile-drawer-item-title">{item.title}</div>
                    <div className="mobile-drawer-item-artist">{item.artist || ''}</div>
                  </div>
                  <div className="mobile-drawer-item-duration">{formatTime(item.duration_ms)}</div>
                  {!locked && !liveLock && (
                    <button className="mobile-drawer-item-remove" onClick={() => handleRemove(item)}>✕</button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
