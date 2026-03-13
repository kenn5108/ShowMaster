import React, { useEffect, useState, useRef } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTimeMMSS } from '../../utils/format';

/**
 * MiniPrompter — compact lyrics preview in the right panel.
 * Shows current song, active line, a few surrounding lines, time remaining.
 */
export default function MiniPrompter() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const playback = state.playback || {};
  const queue = state.queue || [];
  const stageMessage = state.stageMessage || '';

  const [lyrics, setLyrics] = useState([]);
  const [cues, setCues] = useState([]);
  const [activeLine, setActiveLine] = useState(-1);
  const lastSongId = useRef(null);

  const currentSong = playback.currentSong;
  const currentQueueItem = queue.find(q => q.is_current === 1);
  const currentIdx = queue.findIndex(q => q.is_current === 1);
  const nextSong = currentIdx >= 0 && currentIdx + 1 < queue.length ? queue[currentIdx + 1] : null;
  const remainingMs = Math.max(0, (rs.durationMs || 0) - (rs.positionMs || 0));

  // Load lyrics when song changes
  useEffect(() => {
    const songId = currentQueueItem?.song_id || currentSong?.id;
    if (!songId || songId === lastSongId.current) return;
    lastSongId.current = songId;

    api.get(`/lyrics/${songId}`).then(data => {
      setLyrics((data.text || '').split('\n'));
    }).catch(() => setLyrics([]));

    api.get(`/lyrics/${songId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentQueueItem?.song_id, currentSong?.id]);

  // Reset when no song
  useEffect(() => {
    if (!currentSong && !currentQueueItem) {
      setLyrics([]);
      setCues([]);
      setActiveLine(-1);
      lastSongId.current = null;
    }
  }, [currentSong, currentQueueItem]);

  // Compute active line
  useEffect(() => {
    if (cues.length === 0) { setActiveLine(-1); return; }
    const pos = rs.positionMs || 0;
    let active = -1;
    for (const cue of cues) {
      if (pos >= cue.time_ms) active = cue.line_index;
      else break;
    }
    setActiveLine(active);
  }, [rs.positionMs, cues]);

  // Show ~5 lines around active
  const visibleLines = [];
  if (lyrics.length > 0) {
    const center = activeLine >= 0 ? activeLine : 0;
    const start = Math.max(0, center - 2);
    const end = Math.min(lyrics.length, center + 3);
    for (let i = start; i < end; i++) {
      visibleLines.push({ index: i, text: lyrics[i], active: i === activeLine });
    }
  }

  const title = currentSong?.title || currentQueueItem?.title || null;
  const artist = currentSong?.artist || currentQueueItem?.artist || null;

  return (
    <div className="mini-prompter">
      <div className="mini-prompter-header">
        <span className="mini-prompter-label">Prompteur</span>
        {rs.playerState === 'PLAYING' && (
          <span className="mini-prompter-live-dot" />
        )}
      </div>

      {title ? (
        <>
          <div className="mini-prompter-song">
            <div className="mini-prompter-song-title">{title}</div>
            {artist && <div className="mini-prompter-song-artist">{artist}</div>}
          </div>

          <div className="mini-prompter-time">
            <span>{formatTimeMMSS(rs.positionMs || 0)}</span>
            <span>-{formatTimeMMSS(remainingMs)}</span>
          </div>

          <div className="mini-prompter-lyrics">
            {visibleLines.length > 0 ? (
              visibleLines.map(line => (
                <div
                  key={line.index}
                  className={`mini-prompter-line ${line.active ? 'active' : ''}`}
                >
                  {line.text || '\u00A0'}
                </div>
              ))
            ) : (
              <div className="mini-prompter-no-lyrics">Pas de paroles</div>
            )}
          </div>

          {nextSong && (
            <div className="mini-prompter-next">
              Suivant : {nextSong.title}
            </div>
          )}
        </>
      ) : (
        <div className="mini-prompter-idle">En attente...</div>
      )}

      {stageMessage && (
        <div className="mini-prompter-stage-msg">{stageMessage}</div>
      )}
    </div>
  );
}
