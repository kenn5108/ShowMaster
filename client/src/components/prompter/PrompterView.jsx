import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTime, formatTimeMMSS } from '../../utils/format';

export default function PrompterView() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const playback = state.playback || {};
  const queue = state.queue || [];
  const stageMessage = state.stageMessage || '';

  const [lyrics, setLyrics] = useState([]);
  const [cues, setCues] = useState([]);
  const [activeLine, setActiveLine] = useState(-1);
  const [currentSong, setCurrentSong] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const activeRef = useRef(null);
  const lastSongId = useRef(null);

  // Track current and next song from queue
  // Priority: is_current=1 (playing/paused) → queue[0] (prepared state) → null
  useEffect(() => {
    const playing = queue.find(q => q.is_current === 1);
    const current = playing || queue[0] || null;
    const currentIdx = current ? queue.indexOf(current) : -1;
    setCurrentSong(current);
    setNextSong(currentIdx >= 0 && currentIdx + 1 < queue.length ? queue[currentIdx + 1] : null);
  }, [queue]);

  // Load lyrics when current song changes
  useEffect(() => {
    const songId = currentSong?.song_id;
    if (!songId || songId === lastSongId.current) return;
    lastSongId.current = songId;

    api.get(`/lyrics/${songId}`).then(data => {
      const text = data.text || '';
      setLyrics(text.split('\n'));
    }).catch(() => setLyrics([]));

    api.get(`/lyrics/${songId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentSong?.song_id]);

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
          {currentSong ? `${currentSong.title} — ${currentSong.artist}` : 'En attente...'}
        </div>
        {nextSong && (
          <div className="prompter-next">
            Suivant : {nextSong.title} — {nextSong.artist}
          </div>
        )}
        <div className="prompter-info">
          {currentSong && (
            <>
              <span>Position : {queuePosition}/{queue.length}</span>
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
