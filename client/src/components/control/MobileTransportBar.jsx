import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { IconStop, IconPlay, IconPause, IconNext, IconRewind30 } from './TransportIcons';
import MobileQueueDrawer from './MobileQueueDrawer';

/**
 * MobileTransportBar — fixed bottom bar visible only on mobile (≤768px).
 * Always accessible regardless of sidebar / right-panel state.
 * Big touch-friendly buttons: Rewind30, Stop, Play/Pause, Next, Auto/Manual toggle.
 * Chevron button opens MobileQueueDrawer (bottom sheet with full queue).
 */
export default function MobileTransportBar() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const playback = state.playback || {};
  const queue = state.queue || [];
  const [drawerOpen, setDrawerOpen] = useState(false);

  const syncMode = !!playback.syncMode;
  const isPlaying = rs.playerState === 'PLAYING';
  const isPaused = rs.playerState === 'PAUSED';
  const progress = rs.durationMs > 0 ? (rs.positionMs / rs.durationMs) * 100 : 0;

  // Current song: sync title → playing item → queue head → null
  const currentSong = useMemo(() => {
    if (syncMode) return { title: playback.syncMode.title, artist: null };
    if (playback.currentSong) return playback.currentSong;
    return queue[0] || null;
  }, [playback.currentSong, playback.syncMode, syncMode, queue]);

  // ── Drag-seek state ──
  const barRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState(0);

  const pctFromEvent = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // Mouse drag
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    setDragPct(pctFromEvent(e.clientX));
  }, [pctFromEvent]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      e.preventDefault();
      const x = e.clientX ?? e.touches?.[0]?.clientX;
      if (x != null) setDragPct(pctFromEvent(x));
    };
    const onUp = (e) => {
      const x = e.clientX ?? e.changedTouches?.[0]?.clientX;
      const pct = pctFromEvent(x);
      setDragging(false);
      if (rs.durationMs > 0) {
        api.post('/playback/seek', { positionMs: Math.floor(pct * rs.durationMs) }).catch(() => {});
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
    };
  }, [dragging, pctFromEvent, rs.durationMs]);

  // Touch drag on handle
  const onHandleTouchStart = useCallback((e) => {
    e.stopPropagation();
    setDragging(true);
    setDragPct(pctFromEvent(e.touches[0].clientX));
  }, [pctFromEvent]);

  const displayPct = dragging ? dragPct * 100 : progress;

  const handlePlay = () => api.post('/playback/play').catch(() => {});
  const handlePause = () => api.post('/playback/pause').catch(() => {});
  const handleStop = () => api.post('/playback/stop').catch(() => {});
  const handleNext = () => { if (!syncMode) api.post('/playback/next').catch(() => {}); };
  const toggleMode = () => { if (!syncMode) api.post('/playback/mode', {
    mode: playback.mode === 'auto' ? 'manual' : 'auto'
  }).catch(() => {}); };
  const handleRewind30 = () => {
    const newPos = Math.max(0, rs.positionMs - 30000);
    api.post('/playback/seek', { positionMs: newPos }).catch(() => {});
  };

  return (
    <>
      {/* Queue drawer — MUST be a sibling, never a child of .mobile-transport.
          Fixed-inside-fixed causes stacking issues on iOS Safari. */}
      <MobileQueueDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Player — always visible, always on top */}
      <div className="mobile-transport">
        {/* Song info + progress row */}
        <div className="mobile-transport-info">
          <div className="mobile-transport-song">
            {currentSong ? (
              <>
                <span className="mobile-transport-title">
                  {syncMode && <span style={{ color: 'var(--warning)', marginRight: 6 }}>SYNCHRO</span>}
                  {currentSong.title}
                </span>
                {currentSong.artist && <span className="mobile-transport-artist">{currentSong.artist}</span>}
              </>
            ) : (
              <span className="mobile-transport-idle">Aucun morceau</span>
            )}
          </div>
          <div className="mobile-transport-time">
            <span>{dragging ? formatTime(Math.floor(dragPct * rs.durationMs)) : formatTime(rs.positionMs)}</span>
            <span>{formatTime(rs.durationMs)}</span>
          </div>
        </div>

        {/* Progress bar — drag handle only, no click-to-seek */}
        <div className="mobile-transport-progress" ref={barRef}>
          <div className="mobile-transport-progress-fill" style={{ width: `${displayPct}%`, transition: dragging ? 'none' : undefined }} />
          <div
            className="progress-handle mobile-progress-handle"
            style={{ left: `${displayPct}%` }}
            onMouseDown={onHandleMouseDown}
            onTouchStart={onHandleTouchStart}
          />
        </div>

        {/* Controls row */}
        <div className="mobile-transport-controls">
          <button
            className={`mobile-transport-mode ${playback.mode === 'auto' ? 'mode-auto' : 'mode-manual'}`}
            onClick={toggleMode}
            style={syncMode ? { opacity: 0.3, pointerEvents: 'none' } : {}}
          >
            {playback.mode === 'auto' ? 'AUTO' : 'MAN'}
          </button>

          <button className="mobile-transport-btn" onClick={handleRewind30} title="Retour 30s">
            <IconRewind30 size={20} />
          </button>

          <button className="mobile-transport-btn" onClick={handleStop} title="Stop">
            <IconStop />
          </button>

          {isPlaying ? (
            <button className="mobile-transport-btn mobile-transport-btn-main" onClick={handlePause} title="Pause">
              <IconPause />
            </button>
          ) : (
            <button className="mobile-transport-btn mobile-transport-btn-main" onClick={handlePlay} title="Play">
              <IconPlay />
            </button>
          )}

          <button
            className="mobile-transport-btn"
            onClick={handleNext}
            title="Suivant"
            style={syncMode ? { opacity: 0.3, pointerEvents: 'none' } : {}}
          >
            <IconNext />
          </button>

          {/* Queue drawer toggle */}
          <button
            className={`mobile-transport-queue-btn ${drawerOpen ? 'drawer-open' : ''}`}
            onClick={() => setDrawerOpen(prev => !prev)}
            title="File d'attente"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4,13 10,7 16,13" />
            </svg>
            {queue.length > 0 && (
              <span className="mobile-transport-queue-badge">{queue.length}</span>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
