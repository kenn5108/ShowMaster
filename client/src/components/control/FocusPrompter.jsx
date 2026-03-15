import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { formatTimeMMSS } from '../../utils/format';

/**
 * FocusPrompter — expanded prompter overlay for desktop/tablet.
 *
 * Covers the sidebar + main-content area but NOT the right panel or transport bar.
 * Reuses the same lyrics/cues logic as MiniPrompter but with a full-size display.
 */
export default function FocusPrompter({ onClose }) {
  const { state } = useSocket();
  const rs = state.rocketshow || {};
  const queue = state.queue || [];
  const syncMode = state.playback?.syncMode || null;
  const stageMessage = state.stageMessage || '';

  const [lyrics, setLyrics] = useState([]);
  const [cues, setCues] = useState([]);
  const [activeLine, setActiveLine] = useState(-1);
  const lastSongId = useRef(null);
  const lyricsRef = useRef(null);

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

  // Load lyrics when song changes
  useEffect(() => {
    if (!currentSongId) {
      setLyrics([]); setCues([]); setActiveLine(-1);
      lastSongId.current = null;
      return;
    }
    if (currentSongId === lastSongId.current) return;
    lastSongId.current = currentSongId;
    setLyrics([]); setCues([]); setActiveLine(-1);

    api.get(`/lyrics/${currentSongId}`).then(data => {
      setLyrics((data.text || '').split('\n'));
    }).catch(() => setLyrics([]));
    api.get(`/lyrics/${currentSongId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentSongId]);

  // Compute active line from cues
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

  // Auto-scroll active line into view
  useEffect(() => {
    if (activeLine < 0 || !lyricsRef.current) return;
    const el = lyricsRef.current.querySelector(`[data-line="${activeLine}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeLine]);

  const title = currentQueueItem?.title || null;
  const artist = currentQueueItem?.artist || null;

  return (
    <div className="focus-prompter" onClick={onClose}>
      <div className="focus-prompter-inner" onClick={onClose}>
        {/* Header */}
        <div className="focus-prompter-header">
          <div className="focus-prompter-title-row">
            <span className="focus-prompter-label">Prompteur</span>
            {syncMode && <span className="focus-prompter-sync-badge">SYNCHRO</span>}
            {rs.playerState === 'PLAYING' && <span className="mini-prompter-live-dot" />}
          </div>
          {title && (
            <div className="focus-prompter-song">
              <span className="focus-prompter-song-title">{title}</span>
              {artist && <span className="focus-prompter-song-artist"> — {artist}</span>}
            </div>
          )}
          <div className="focus-prompter-time">
            <span>{formatTimeMMSS(positionMs)}</span>
            <span>-{formatTimeMMSS(remainingMs)}</span>
          </div>
          {nextSong && (
            <div className="focus-prompter-next">Suivant : {nextSong.title}</div>
          )}
        </div>

        {/* Lyrics */}
        <div className="focus-prompter-lyrics" ref={lyricsRef}>
          {title ? (
            lyrics.length > 0 ? (
              lyrics.map((line, i) => (
                <div
                  key={i}
                  data-line={i}
                  className={`focus-prompter-line ${i === activeLine ? 'active' : ''}`}
                >
                  {line || '\u00A0'}
                </div>
              ))
            ) : (
              <div className="focus-prompter-no-lyrics">Pas de paroles</div>
            )
          ) : (
            <div className="focus-prompter-idle">En attente...</div>
          )}
        </div>

        {/* Stage message */}
        {stageMessage && (
          <div className="focus-prompter-stage-msg">{stageMessage}</div>
        )}
      </div>
    </div>
  );
}
