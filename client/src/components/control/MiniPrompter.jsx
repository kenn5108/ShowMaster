import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTimeMMSS } from '../../utils/format';

/**
 * MiniPrompter — compact lyrics preview in the right panel.
 * Shows current song, active line, a few surrounding lines, time remaining.
 * Single source of truth: queue head (is_current=1 or queue[0]).
 */
export default function MiniPrompter() {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const queue = state.queue || [];
  const syncMode = state.playback?.syncMode || null;
  const stageMessage = state.stageMessage || '';

  const [lyrics, setLyrics] = useState([]);
  const [cues, setCues] = useState([]);
  const [activeLine, setActiveLine] = useState(-1);
  const lastSongId = useRef(null);

  // In sync mode: use the sync song. Otherwise: queue head
  const currentQueueItem = useMemo(() => {
    if (syncMode) return { song_id: syncMode.songId, title: syncMode.title, artist: syncMode.artist };
    return queue.find(q => q.is_current === 1) || queue[0] || null;
  }, [queue, syncMode]);

  const currentSongId = currentQueueItem?.song_id || null;
  const currentIdx = !syncMode && currentQueueItem ? queue.indexOf(currentQueueItem) : -1;
  const nextSong = !syncMode && currentIdx >= 0 && currentIdx + 1 < queue.length ? queue[currentIdx + 1] : null;
  const isPlaying = rs.playerState === 'PLAYING' || rs.playerState === 'PAUSED';
  const durationMs = isPlaying ? (rs.durationMs || 0) : (currentQueueItem?.duration_ms || rs.durationMs || 0);
  const positionMs = isPlaying ? (rs.positionMs || 0) : 0;
  const remainingMs = Math.max(0, durationMs - positionMs);

  // Load lyrics when queue head song changes
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

    // Clear old lyrics immediately
    setLyrics([]);
    setCues([]);
    setActiveLine(-1);

    api.get(`/lyrics/${currentSongId}`).then(data => {
      setLyrics((data.text || '').split('\n'));
    }).catch(() => setLyrics([]));

    api.get(`/lyrics/${currentSongId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentSongId]);

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

  const title = currentQueueItem?.title || null;
  const artist = currentQueueItem?.artist || null;

  return (
    <div className="mini-prompter">
      <div className="mini-prompter-header">
        <span className="mini-prompter-label">Prompteur</span>
        {syncMode && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--warning)', marginLeft: 6 }}>SYNCHRO</span>}
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
            <span>{formatTimeMMSS(positionMs)}</span>
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
        <div className="stage-marquee stage-marquee-mini">
          <span className="stage-marquee-text">{stageMessage}</span>
        </div>
      )}
    </div>
  );
}
