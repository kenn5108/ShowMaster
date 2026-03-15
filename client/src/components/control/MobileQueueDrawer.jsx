import React, { useState, useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime, formatDuration } from '../../utils/format';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import { dbg } from '../../utils/debugLog';
import Popup from '../shared/Popup';

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
  const [confirmClear, setConfirmClear] = useState(false);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const dragFromEl = useRef(null);
  const dragOverEl = useRef(null);

  const isLocked = (item) =>
    item.is_current === 1 && (playerState === 'PLAYING' || playerState === 'PAUSED');

  const pos0Locked = queue[0] && isLocked(queue[0]);

  // ── Touch drag ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    dbg('MQ', 'onMove', `fromIdx=${fromIdx} toIdx=${toIdx}`);
    const item = queue[fromIdx];
    if (!item || item.is_current === 1) { dbg('MQ', 'onMove', 'BLOCKED (locked)'); return; }
    if (liveLock) { dbg('MQ', 'onMove', 'BLOCKED (liveLock)'); return; }
    const safePos = pos0Locked && toIdx === 0 ? 1 : toIdx;
    if (safePos === fromIdx) { dbg('MQ', 'onMove', 'SKIP (same pos)'); return; }
    dbg('MQ', 'onMove', `EXEC id=${item.id} → pos=${safePos}`);
    api.post('/queue/move', { queueItemId: item.id, newPosition: safePos }).catch(() => {});
  }, [queue, liveLock, pos0Locked]));

  // ── HTML5 drag fallback ──
  const cleanupDragClasses = () => {
    if (dragFromEl.current) { dragFromEl.current.classList.remove('touch-dragging'); dragFromEl.current = null; }
    if (dragOverEl.current) { dragOverEl.current.classList.remove('touch-drag-over', 'touch-drag-over-above'); dragOverEl.current = null; }
  };

  const handleDragStart = (idx, e) => {
    const item = queue[idx];
    if (!item || isLocked(item)) return;
    dragItem.current = idx;
    const row = e.currentTarget;
    row.classList.add('touch-dragging');
    dragFromEl.current = row;
  };
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragItem.current === null) return;
    dragOverItem.current = idx;
    if (dragOverEl.current) dragOverEl.current.classList.remove('touch-drag-over', 'touch-drag-over-above');
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    const effectiveIdx = insertBefore ? idx : idx + 1;
    if (effectiveIdx !== dragItem.current && effectiveIdx !== dragItem.current + 1) {
      row.classList.add(insertBefore ? 'touch-drag-over-above' : 'touch-drag-over');
    }
    dragOverEl.current = row;
  };
  const handleDrop = () => {
    cleanupDragClasses();
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    if (liveLock) return;
    const item = queue[dragItem.current];
    if (!item || isLocked(item)) return;
    const safePos = pos0Locked && dragOverItem.current === 0 ? 1 : dragOverItem.current;
    if (safePos === dragItem.current) { dragItem.current = null; dragOverItem.current = null; return; }
    api.post('/queue/move', { queueItemId: item.id, newPosition: safePos }).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };
  const handleDragEnd = () => {
    cleanupDragClasses();
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
          {queue.length > 0 && (
            <span className="mobile-drawer-duration">{formatDuration(queue.reduce((sum, q) => sum + (q.duration_ms || 0), 0))}</span>
          )}
          {!liveLock && queue.length > 1 && (
            <button
              className="mobile-drawer-clear"
              onClick={() => setConfirmClear(true)}
            >
              Vider
            </button>
          )}
          <button className="mobile-drawer-close" onClick={onClose}>✕</button>
        </div>

        {/* Queue list */}
        <div className="mobile-drawer-list" data-drag-list={queue.length} style={syncMode ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
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
                  onDragStart={(e) => { if (touchDrag.isTouching()) { e.preventDefault(); return; } handleDragStart(idx, e); }}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  {...(!locked && !liveLock ? touchDrag.rowTouchHandlers(idx) : {})}
                >
                  <div className="mobile-drawer-item-handle">
                    {locked ? (
                      <span className="mobile-drawer-playing-icon">▶</span>
                    ) : (
                      !liveLock && (
                        <span className="drag-handle">⠿</span>
                      )
                    )}
                    {!locked && liveLock && <span className="mobile-drawer-num">{idx + 1}</span>}
                  </div>
                  <div className="mobile-drawer-item-info">
                    <div className="mobile-drawer-item-title">{item.title}</div>
                    <div className="mobile-drawer-item-artist">{item.artist || ''}</div>
                  </div>
                  <div className="mobile-drawer-item-duration">{formatTime(item.duration_ms)}</div>
                  {!locked && !liveLock ? (
                    <button className="mobile-drawer-item-remove" onClick={() => handleRemove(item)}>✕</button>
                  ) : (
                    <span className="mobile-drawer-item-remove-spacer" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {confirmClear && (
        <Popup
          title="Voulez-vous vraiment vider la file d'attente ?"
          actions={[{ label: 'Vider', onClick: () => api.post('/queue/clear') }]}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </>
  );
}
