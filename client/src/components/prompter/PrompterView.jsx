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
  useEffect(() => {
    const current = queue.find(q => q.is_current === 1);
    const currentIdx = queue.findIndex(q => q.is_current === 1);
    setCurrentSong(current || null);
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

  const remainingMs = Math.max(0, (rs.durationMs || 0) - (rs.positionMs || 0));
  const queuePosition = queue.findIndex(q => q.is_current === 1) + 1;

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
              <span>{formatTimeMMSS(rs.positionMs)} / {formatTimeMMSS(rs.durationMs)}</span>
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
