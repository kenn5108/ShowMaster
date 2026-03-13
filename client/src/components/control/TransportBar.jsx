import React from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';

export default function TransportBar() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const playback = state.playback || {};
  const currentSong = playback.currentSong;
  const isPlaying = rs.playerState === 'PLAYING';
  const isPaused = rs.playerState === 'PAUSED';
  const progress = rs.durationMs > 0 ? (rs.positionMs / rs.durationMs) * 100 : 0;

  const handlePlay = () => {
    if (isPaused) {
      api.post('/playback/play').catch(() => {});
    } else if (!isPlaying) {
      api.post('/playback/play').catch(() => {});
    }
  };

  const handlePause = () => api.post('/playback/pause').catch(() => {});
  const handleStop = () => api.post('/playback/stop').catch(() => {});
  const handleNext = () => api.post('/playback/next').catch(() => {});

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const posMs = Math.floor(pct * rs.durationMs);
    api.post('/playback/seek', { positionMs: posMs }).catch(() => {});
  };

  return (
    <div className="transport-bar">
      {/* Now playing info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {currentSong ? (
          <>
            <div className="song-title" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentSong.title}
            </div>
            <div className="song-artist" style={{ fontSize: 11 }}>{currentSong.artist}</div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun morceau</div>
        )}
      </div>

      {/* Progress */}
      <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {formatTime(rs.positionMs)}
        </span>
        <div className="progress-bar" onClick={handleSeek}>
          <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 36 }}>
          {formatTime(rs.durationMs)}
        </span>
      </div>

      {/* Transport buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn-transport" onClick={handleStop} title="Stop">⏹</button>
        {isPlaying ? (
          <button className="btn-transport active" onClick={handlePause} title="Pause">⏸</button>
        ) : (
          <button className="btn-transport" onClick={handlePlay} title="Play">▶</button>
        )}
        <button className="btn-transport" onClick={handleNext} title="Suivant">⏭</button>
      </div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 10 }}>
        <button
          className={`btn btn-sm ${playback.mode === 'auto' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => api.post('/playback/mode', { mode: playback.mode === 'auto' ? 'manual' : 'auto' })}
          style={{ fontSize: 10, padding: '3px 8px' }}
        >
          {playback.mode === 'auto' ? 'AUTO' : 'MANUEL'}
        </button>
      </div>
    </div>
  );
}
