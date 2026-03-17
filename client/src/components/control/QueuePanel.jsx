import React, { useState, useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime, formatDuration } from '../../utils/format';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import Popup from '../shared/Popup';

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
  const syncMode = !!state.playback?.syncMode;
  const playerState = state.rocketshow?.playerState || 'STOPPED';
  const [confirmClear, setConfirmClear] = useState(false);
  const [popup, setPopup] = useState(null);
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const dragFromEl = useRef(null);
  const dragOverEl = useRef(null);

  // Stable ref — always points to the latest queue/state for use inside callbacks
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const stateRef = useRef({ playerState });
  stateRef.current = { playerState };

  // Only locked when actually playing or paused — not just "next in line"
  const isLocked = (item) =>
    item.is_current === 1 && (playerState === 'PLAYING' || playerState === 'PAUSED');

  // Position 0 is protected when the head item is PLAYING or PAUSED
  const pos0Locked = queue[0] && isLocked(queue[0]);

  // ── Context menu (long-press touch / right-click desktop) ──
  const openContextMenu = useCallback((idx) => {
    const q = queueRef.current;
    const s = stateRef.current;
    const item = q[idx];
    if (!item) return;
    if (item.is_current === 1 && (s.playerState === 'PLAYING' || s.playerState === 'PAUSED')) return;
    const headLocked = q[0] && q[0].is_current === 1 && (s.playerState === 'PLAYING' || s.playerState === 'PAUSED');
    const topPos = headLocked ? 1 : 0;
    const bottomPos = q.length - 1;
    const actions = [];
    if (idx !== topPos) {
      actions.push({ label: '⬆ Déplacer tout en haut', onClick: () => api.post('/queue/move', { queueItemId: item.id, newPosition: topPos }).catch(() => {}) });
    }
    if (idx !== bottomPos) {
      actions.push({ label: '⬇ Déplacer tout en bas', onClick: () => api.post('/queue/move', { queueItemId: item.id, newPosition: bottomPos }).catch(() => {}) });
    }
    if (actions.length > 0) setPopup({ title: item.title, actions });
  }, []);

  // ── Touch drag (mobile) ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    const q = queueRef.current;
    const s = stateRef.current;
    const item = q[fromIdx];
    if (!item || item.is_current === 1) return;
    const headLocked = q[0] && q[0].is_current === 1 && (s.playerState === 'PLAYING' || s.playerState === 'PAUSED');
    const safePos = headLocked && toIdx === 0 ? 1 : toIdx;
    if (safePos === fromIdx) return;
    api.post('/queue/move', { queueItemId: item.id, newPosition: safePos }).catch(() => {});
  }, []), {
    onContextMenu: useCallback((idx) => openContextMenu(idx), [openContextMenu]),
  });

  // ── HTML5 drag (desktop) ──
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
    if (isLocked(item)) return;
    api.post('/queue/remove', { queueItemId: item.id }).catch(() => {});
  };

  return (
    <div className="queue-panel" style={syncMode ? { opacity: 0.4, pointerEvents: 'none' } : {}}>
      <div className="queue-panel-header">
        <span className="queue-panel-title">File d'attente</span>
        {syncMode && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)', marginLeft: 8 }}>SYNCHRO</span>}
        <span className="queue-panel-count">{queue.length}</span>
        {queue.length > 0 && (
          <span className="queue-panel-duration">{formatDuration(queue.reduce((sum, q) => sum + (q.duration_ms || 0), 0))}</span>
        )}
        {queue.length > 1 && (
          <button className="queue-panel-clear" onClick={() => setConfirmClear(true)}>
            Vider
          </button>
        )}
      </div>

      <div className="queue-panel-list" data-drag-list={queue.length}>
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
                draggable={!locked}
                onDragStart={(e) => { if (touchDrag.isTouching()) { e.preventDefault(); return; } handleDragStart(idx, e); }}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onContextMenu={(e) => { e.preventDefault(); if (touchDrag.isTouching()) return; openContextMenu(idx); }}
                {...(!locked ? touchDrag.rowTouchHandlers(idx) : {})}
              >
                <div className="queue-panel-item-index">
                  {locked ? (
                    <span className="queue-panel-playing-icon">▶</span>
                  ) : (
                    <span className="drag-handle-sm">⠿</span>
                  )}
                </div>
                <div className="queue-panel-item-info">
                  <div className="queue-panel-item-title">{item.title}</div>
                  <div className="queue-panel-item-artist">{item.artist || ''}</div>
                </div>
                <div className="queue-panel-item-duration">{formatTime(item.duration_ms)}</div>
                {!locked ? (
                  <button className="queue-panel-item-remove" onClick={() => handleRemove(item)}>✕</button>
                ) : (
                  <span className="queue-panel-item-remove-spacer" />
                )}
              </div>
            );
          })
        )}
      </div>

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}

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
