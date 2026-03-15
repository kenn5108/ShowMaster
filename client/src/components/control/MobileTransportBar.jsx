import React, { useMemo, useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import MobileQueueDrawer from './MobileQueueDrawer';

/**
 * MobileTransportBar — fixed bottom bar visible only on mobile (≤768px).
 * Always accessible regardless of sidebar / right-panel state.
 * Big touch-friendly buttons: Stop, Play/Pause, Next, Auto/Manual toggle.
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
  const isActive = isPlaying || isPaused;
  const progress = rs.durationMs > 0 ? (rs.positionMs / rs.durationMs) * 100 : 0;

  // Current song: sync title → playing item → queue head → null
  const currentSong = useMemo(() => {
    if (syncMode) return { title: playback.syncMode.title, artist: null };
    if (playback.currentSong) return playback.currentSong;
    return queue[0] || null;
  }, [playback.currentSong, playback.syncMode, syncMode, queue]);

  const handlePlay = () => api.post('/playback/play').catch(() => {});
  const handlePause = () => api.post('/playback/pause').catch(() => {});
  const handleStop = () => api.post('/playback/stop').catch(() => {});
  const handleNext = () => { if (!syncMode) api.post('/playback/next').catch(() => {}); };
  const toggleMode = () => { if (!syncMode) api.post('/playback/mode', {
    mode: playback.mode === 'auto' ? 'manual' : 'auto'
  }).catch(() => {}); };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const posMs = Math.floor((pct / rect.width) * rs.durationMs);
    if (posMs >= 0) api.post('/playback/seek', { positionMs: posMs }).catch(() => {});
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
            <span>{formatTime(rs.positionMs)}</span>
            <span>{formatTime(rs.durationMs)}</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mobile-transport-progress" onClick={handleSeek} onTouchEnd={handleSeek}>
          <div className="mobile-transport-progress-fill" style={{ width: `${progress}%` }} />
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

          <button className="mobile-transport-btn" onClick={handleStop} title="Stop">
            ⏹
          </button>

          {isPlaying ? (
            <button className="mobile-transport-btn mobile-transport-btn-main" onClick={handlePause} title="Pause">
              ⏸
            </button>
          ) : (
            <button className="mobile-transport-btn mobile-transport-btn-main" onClick={handlePlay} title="Play">
              ▶
            </button>
          )}

          <button
            className="mobile-transport-btn"
            onClick={handleNext}
            title="Suivant"
            style={syncMode ? { opacity: 0.3, pointerEvents: 'none' } : {}}
          >
            ⏭
          </button>

          {/* Queue drawer toggle — chevron + badge (tap = toggle) */}
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
