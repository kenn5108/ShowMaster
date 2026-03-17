import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { IconStop, IconPlay, IconPause, IconNext, IconRewind30 } from './TransportIcons';

export default function TransportBar() {
  const { state, setSeekDragMs } = useSocket();
  const rs = state.rocketshow || {};
  const playback = state.playback || {};
  const syncMode = !!playback.syncMode;
  const currentSong = playback.currentSong;
  const isPlaying = rs.playerState === 'PLAYING';
  const isPaused = rs.playerState === 'PAUSED';
  const progress = rs.durationMs > 0 ? (rs.positionMs / rs.durationMs) * 100 : 0;

  // ── Drag-seek state ──
  const barRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragPct, setDragPct] = useState(0);

  const pctFromEvent = useCallback((clientX) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  // Mouse drag handlers
  const onHandleMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const pct = pctFromEvent(e.clientX);
    setDragging(true);
    setDragPct(pct);
    if (rs.durationMs > 0) setSeekDragMs(Math.floor(pct * rs.durationMs));
  }, [pctFromEvent, rs.durationMs, setSeekDragMs]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const pct = pctFromEvent(e.clientX);
      setDragPct(pct);
      if (rs.durationMs > 0) setSeekDragMs(Math.floor(pct * rs.durationMs));
    };
    const onUp = (e) => {
      const pct = pctFromEvent(e.clientX);
      setDragging(false);
      setSeekDragMs(null);
      if (rs.durationMs > 0) {
        api.post('/playback/seek', { positionMs: Math.floor(pct * rs.durationMs) }).catch(() => {});
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, [dragging, pctFromEvent, rs.durationMs, setSeekDragMs]);

  // Touch drag handlers (on handle)
  const onHandleTouchStart = useCallback((e) => {
    e.stopPropagation();
    const pct = pctFromEvent(e.touches[0].clientX);
    setDragging(true);
    setDragPct(pct);
    if (rs.durationMs > 0) setSeekDragMs(Math.floor(pct * rs.durationMs));
  }, [pctFromEvent, rs.durationMs, setSeekDragMs]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      e.preventDefault();
      const pct = pctFromEvent(e.touches[0].clientX);
      setDragPct(pct);
      if (rs.durationMs > 0) setSeekDragMs(Math.floor(pct * rs.durationMs));
    };
    const onEnd = (e) => {
      const touch = e.changedTouches[0];
      const pct = pctFromEvent(touch.clientX);
      setDragging(false);
      setSeekDragMs(null);
      if (rs.durationMs > 0) {
        api.post('/playback/seek', { positionMs: Math.floor(pct * rs.durationMs) }).catch(() => {});
      }
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    return () => { document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onEnd); };
  }, [dragging, pctFromEvent, rs.durationMs, setSeekDragMs]);

  const displayPct = dragging ? dragPct * 100 : progress;

  const handlePlay = () => {
    if (isPaused || !isPlaying) api.post('/playback/play').catch(() => {});
  };
  const handlePause = () => api.post('/playback/pause').catch(() => {});
  const handleStop = () => api.post('/playback/stop').catch(() => {});
  const handleNext = () => { if (!syncMode) api.post('/playback/next').catch(() => {}); };
  const handleRewind30 = () => {
    const newPos = Math.max(0, rs.positionMs - 30000);
    api.post('/playback/seek', { positionMs: newPos }).catch(() => {});
  };

  const displayTitle = syncMode ? playback.syncMode.title : currentSong?.title;
  const displayArtist = syncMode ? null : currentSong?.artist;

  return (
    <div className="transport-bar">
      {/* Zone left — song info (aligns with sidebar) */}
      <div className="transport-zone transport-zone-left">
        {displayTitle ? (
          <>
            <div className="song-title" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {syncMode && <span style={{ color: 'var(--warning)', marginRight: 6 }}>SYNCHRO</span>}
              {displayTitle}
            </div>
            {displayArtist && <div className="song-artist" style={{ fontSize: 11 }}>{displayArtist}</div>}
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun morceau</div>
        )}
      </div>

      {/* Zone center — progress + time (aligns with main content) */}
      <div className="transport-zone transport-zone-center">
        <span style={{ fontSize: 11, color: dragging ? 'var(--accent)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {dragging ? formatTime(Math.floor(dragPct * rs.durationMs)) : formatTime(rs.positionMs)}
        </span>
        <div className="progress-bar" ref={barRef} style={{ cursor: 'default' }}>
          <div className="progress-bar-fill" style={{ width: `${displayPct}%`, transition: dragging ? 'none' : undefined }} />
          <div
            className="progress-handle"
            style={{ left: `${displayPct}%` }}
            onMouseDown={onHandleMouseDown}
            onTouchStart={onHandleTouchStart}
          />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {formatTime(rs.durationMs)}
        </span>
      </div>

      {/* Zone right — buttons + mode (aligns with right panel) */}
      <div className="transport-zone transport-zone-right">
        <button className="btn-transport" onClick={handleRewind30} title="Retour 30s"><IconRewind30 size={20} /></button>
        <button className="btn-transport" onClick={handleStop} title="Stop"><IconStop /></button>
        {isPlaying ? (
          <button className="btn-transport active" onClick={handlePause} title="Pause"><IconPause /></button>
        ) : (
          <button className="btn-transport" onClick={handlePlay} title="Play"><IconPlay /></button>
        )}
        <button
          className="btn-transport"
          onClick={handleNext}
          title="Suivant"
          style={syncMode ? { opacity: 0.3, pointerEvents: 'none' } : {}}
        ><IconNext /></button>
        <button
          className={`btn btn-sm ${playback.mode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { if (!syncMode) api.post('/playback/mode', { mode: playback.mode === 'auto' ? 'manual' : 'auto' }); }}
          style={{ fontSize: 10, padding: '3px 8px', marginLeft: 4, ...(syncMode ? { opacity: 0.3, pointerEvents: 'none' } : {}) }}
        >
          {playback.mode === 'auto' ? 'AUTO' : 'MANUEL'}
        </button>
      </div>
    </div>
  );
}
