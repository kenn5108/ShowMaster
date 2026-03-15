import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime, formatTimeMMSS } from '../../utils/format';

export default function PrompterView() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const queue = state.queue || [];
  const syncMode = state.playback?.syncMode || null;
  const stageMessage = state.stageMessage || '';

  const [lyrics, setLyrics] = useState([]);
  const [cues, setCues] = useState([]);
  const [activeLine, setActiveLine] = useState(-1);
  const activeRef = useRef(null);
  const lastSongId = useRef(null);

  // In sync mode: use the sync song. Otherwise: queue (is_current=1 → queue[0])
  const currentSong = useMemo(() => {
    if (syncMode) return { song_id: syncMode.songId, title: syncMode.title, artist: syncMode.artist };
    return queue.find(q => q.is_current === 1) || queue[0] || null;
  }, [queue, syncMode]);

  const currentSongId = currentSong?.song_id || null;

  // No "next" in sync mode
  const nextSong = useMemo(() => {
    if (syncMode) return null;
    if (!currentSong) return null;
    const idx = queue.indexOf(currentSong);
    return idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : null;
  }, [queue, currentSong, syncMode]);

  // Load lyrics when the head song changes
  useEffect(() => {
    if (!currentSongId) {
      setLyrics([]);
      setCues([]);
      setActiveLine(-1);
      lastSongId.current = null;
      return;
    }
    if (currentSongId === lastSongId.current) return;
    lastSongId.current = currentSongId;

    // Clear old lyrics immediately before loading new ones
    setLyrics([]);
    setCues([]);
    setActiveLine(-1);

    api.get(`/lyrics/${currentSongId}`).then(data => {
      setLyrics((data.text || '').split('\n'));
    }).catch(() => setLyrics([]));

    api.get(`/lyrics/${currentSongId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentSongId]);

  // Update active line based on position
  useEffect(() => {
    if (cues.length === 0) {
      setActiveLine(-1);
      return;
    }

    const pos = rs.positionMs || 0;
    let active = -1;
    for (const cue of cues) {
      if (pos >= cue.time_ms) {
        active = cue.line_index;
      } else {
        break;
      }
    }
    setActiveLine(active);
  }, [rs.positionMs, cues]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeLine]);

  const isPlaying = rs.playerState === 'PLAYING' || rs.playerState === 'PAUSED';
  // Use RS duration when playing, fallback to queue item duration for prepared state
  const durationMs = isPlaying ? (rs.durationMs || 0) : (currentSong?.duration_ms || rs.durationMs || 0);
  const positionMs = isPlaying ? (rs.positionMs || 0) : 0;
  const remainingMs = Math.max(0, durationMs - positionMs);
  const currentIdx = currentSong ? queue.indexOf(currentSong) : -1;
  const queuePosition = currentIdx >= 0 ? currentIdx + 1 : 0;

  return (
    <div className="prompter-layout">
      {/* Header: now playing info */}
      <div className="prompter-header">
        <div className="prompter-now-playing">
          {syncMode && <span style={{ color: '#f59e0b', marginRight: 10 }}>SYNCHRO</span>}
          {currentSong ? `${currentSong.title}${currentSong.artist ? ` — ${currentSong.artist}` : ''}` : 'En attente...'}
        </div>
        {nextSong && (
          <div className="prompter-next">
            Suivant : {nextSong.title} — {nextSong.artist}
          </div>
        )}
        <div className="prompter-info">
          {currentSong && (
            <>
              {!syncMode && <span>Position : {queuePosition}/{queue.length}</span>}
              <span>Restant : {formatTimeMMSS(remainingMs)}</span>
              <span>{formatTimeMMSS(positionMs)} / {formatTimeMMSS(durationMs)}</span>
            </>
          )}
        </div>
      </div>

      {/* Lyrics */}
      <div className="prompter-lyrics">
        {lyrics.length > 0 ? (
          lyrics.map((line, idx) => (
            <div
              key={idx}
              ref={idx === activeLine ? activeRef : null}
              className={`prompter-line ${idx === activeLine ? 'active' : ''}`}
            >
              {line || '\u00A0'}
            </div>
          ))
        ) : (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 20, padding: 40 }}>
            {currentSong ? 'Pas de paroles pour ce morceau' : 'En attente d\'un morceau...'}
          </div>
        )}
      </div>

      {/* Stage message */}
      {stageMessage && (
        <div className="prompter-stage-message">
          {stageMessage}
        </div>
      )}
    </div>
  );
}
