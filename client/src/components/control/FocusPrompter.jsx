import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';

// ── Stage message banner (same as PrompterView) ──
const BANNER_BG = '#1a1306';
const BANNER_BORDER = '#7a5a10';
const BANNER_COLOR = '#f59e0b';

function StageMessageBanner({ message }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !measureRef.current) return;
    const cw = containerRef.current.clientWidth;
    measureRef.current.style.animation = 'none';
    measureRef.current.style.paddingLeft = '0';
    const tw = measureRef.current.scrollWidth;
    setNeedsScroll(tw > cw - 32);
  }, [message]);

  const bannerStyle = {
    flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap',
    background: BANNER_BG,
    borderTop: `1px solid ${BANNER_BORDER}`,
    padding: '8px 0', position: 'relative',
    textAlign: needsScroll ? 'left' : 'center',
  };

  const textBase = {
    fontSize: 'clamp(16px, 2vw, 24px)',
    fontWeight: 700,
    color: BANNER_COLOR,
  };

  const measureStyle = {
    ...textBase,
    position: 'absolute', visibility: 'hidden', top: 0, left: 0,
  };

  if (!needsScroll) {
    return (
      <div ref={containerRef} style={bannerStyle}>
        <span ref={measureRef} style={measureStyle}>{message}</span>
        <span style={textBase}>{message}</span>
      </div>
    );
  }

  const GAP = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  const tickerStyle = {
    ...textBase,
    display: 'inline-block',
    animation: 'marquee-ticker 14s linear infinite',
  };

  return (
    <div ref={containerRef} style={bannerStyle}>
      <span ref={measureRef} style={measureStyle}>{message}</span>
      <span style={tickerStyle}>{message}{GAP}{message}{GAP}</span>
    </div>
  );
}

/**
 * FocusPrompter — expanded prompter overlay for desktop/tablet.
 *
 * Covers the sidebar + main-content area but NOT the right panel or transport bar.
 * Mirrors the exact visual and behavioral logic of the real /prompter view.
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
  const [negativeMode, setNegativeMode] = useState(false);
  const activeRef = useRef(null);
  const firstLineRef = useRef(null);
  const lyricsContainerRef = useRef(null);
  const lastSongId = useRef(null);

  // ── Song resolution ──
  const currentSong = useMemo(() => {
    if (syncMode) return { song_id: syncMode.songId, title: syncMode.title, artist: syncMode.artist };
    return queue.find(q => q.is_current === 1) || queue[0] || null;
  }, [queue, syncMode]);

  const currentSongId = currentSong?.song_id || null;

  const nextSong = useMemo(() => {
    if (syncMode) return null;
    if (!currentSong) return null;
    const idx = queue.indexOf(currentSong);
    return idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : null;
  }, [queue, currentSong, syncMode]);

  // ── Load lyrics ──
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

  // ── Active line from cues ──
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

  // ── Auto-scroll active line to center ──
  const hasScrolledOnce = useRef(false);
  useEffect(() => {
    if (!activeRef.current) return;
    const behavior = hasScrolledOnce.current ? 'smooth' : 'instant';
    activeRef.current.scrollIntoView({ behavior, block: 'center' });
    hasScrolledOnce.current = true;
  }, [activeLine]);
  useEffect(() => { hasScrolledOnce.current = false; }, [currentSongId]);

  // ── Initial positioning: center first line before playback starts ──
  useEffect(() => {
    if (lyrics.length > 0 && activeLine === -1 && firstLineRef.current) {
      firstLineRef.current.scrollIntoView({ behavior: 'instant', block: 'center' });
    }
  }, [lyrics, activeLine]);

  // ── Smart font size: biggest that fits the longest line ──
  const [fontSize, setFontSize] = useState(28);
  const computeFontSize = useCallback(() => {
    if (!lyricsContainerRef.current || lyrics.length === 0) return;
    const container = lyricsContainerRef.current;
    const maxWidth = container.clientWidth - 48;
    if (maxWidth <= 0) return;

    let longest = '';
    for (const line of lyrics) {
      if (line.length > longest.length) longest = line;
    }
    if (!longest) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const fontFamily = getComputedStyle(container).fontFamily || 'sans-serif';
    let lo = 16, hi = 48;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      ctx.font = `600 ${mid}px ${fontFamily}`;
      const w = ctx.measureText(longest).width;
      if (w <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    setFontSize(Math.max(16, Math.min(lo, 48)));
  }, [lyrics]);

  useEffect(() => { computeFontSize(); }, [computeFontSize]);
  useEffect(() => {
    window.addEventListener('resize', computeFontSize);
    return () => window.removeEventListener('resize', computeFontSize);
  }, [computeFontSize]);

  // ── Progress ──
  const isPlaying = rs.playerState === 'PLAYING' || rs.playerState === 'PAUSED';
  const durationMs = isPlaying ? (rs.durationMs || 0) : (currentSong?.duration_ms || rs.durationMs || 0);
  const positionMs = isPlaying ? (rs.positionMs || 0) : 0;
  const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0;

  // ── Color scheme (dark/light) ──
  const bg = negativeMode ? '#f5f5f0' : '#0a0e1a';
  const textActive = negativeMode ? '#111' : '#fff';
  const textDimmed = negativeMode ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
  const textMuted = negativeMode ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  const headerBg = negativeMode ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.03)';
  const borderColor = negativeMode ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  const accentBar = '#e94560';
  const barTrack = negativeMode ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  const activeLineBg = 'rgba(233,69,96,0.75)';
  const toggleBg = negativeMode ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const toggleColor = negativeMode ? '#333' : '#ccc';

  // Stop clicks on the inner content from closing the overlay
  const stopProp = (e) => e.stopPropagation();

  return (
    <div className="focus-prompter" onClick={onClose}>
      <div
        className="focus-prompter-inner"
        onClick={stopProp}
        style={{ background: bg, color: textActive, transition: 'background 0.3s, color 0.3s', cursor: 'default' }}
      >
        {/* ── Header: current (left) + next (right) + close + toggle ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: headerBg, borderBottom: `1px solid ${borderColor}`, flexShrink: 0, gap: 12 }}>
          {/* Left: current song */}
          <div style={{ minWidth: 0, flex: 1 }}>
            {currentSong ? (
              <div style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {syncMode && <span style={{ color: '#f59e0b', marginRight: 8 }}>SYNCHRO</span>}
                {currentSong.title}
                {currentSong.artist && <span style={{ fontWeight: 400, color: textMuted, marginLeft: 8 }}>— {currentSong.artist}</span>}
              </div>
            ) : (
              <div style={{ fontSize: 15, color: textMuted }}>En attente...</div>
            )}
          </div>
          {/* Right: next song + toggle + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {nextSong && (
              <div style={{ textAlign: 'right', minWidth: 0 }}>
                <div style={{ fontSize: 11, color: textActive, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>À suivre</div>
                <div style={{ fontSize: 15, color: textActive, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>
                  {nextSong.title}{nextSong.artist ? ` — ${nextSong.artist}` : ''}
                </div>
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setNegativeMode(m => !m); }}
              style={{ width: 32, height: 32, borderRadius: '50%', background: toggleBg, color: toggleColor, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, transition: 'background 0.3s' }}
              title={negativeMode ? 'Mode sombre' : 'Mode clair'}
            >
              {negativeMode ? '🌙' : '☀️'}
            </button>
            <button
              onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: '50%', background: toggleBg, color: toggleColor, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}
              title="Fermer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Visual progress bar ── */}
        {currentSong && (
          <div style={{ height: 4, background: barTrack, flexShrink: 0 }}>
            <div style={{ height: '100%', background: accentBar, width: `${progress}%`, transition: 'width 0.3s linear', borderRadius: '0 2px 2px 0' }} />
          </div>
        )}

        {/* ── Lyrics ── */}
        <div
          ref={lyricsContainerRef}
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px', textAlign: 'center', touchAction: 'none', overscrollBehavior: 'none', WebkitOverflowScrolling: 'auto' }}
          onTouchStart={e => e.preventDefault()}
          onTouchMove={e => e.preventDefault()}
        >
          {lyrics.length > 0 ? (
            <>
              <div style={{ height: '50%' }} aria-hidden="true" />
              {lyrics.map((line, idx) => {
                const isActive = idx === activeLine;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeRef : (idx === 0 ? firstLineRef : null)}
                    style={{
                      fontSize,
                      fontWeight: 600,
                      lineHeight: 1.4,
                      color: isActive ? textActive : textDimmed,
                      background: isActive ? activeLineBg : 'transparent',
                      borderRadius: isActive ? 8 : 0,
                      padding: '2px 12px',
                      transition: 'color 0.3s, background 0.3s',
                    }}
                  >
                    {line || '\u00A0'}
                  </div>
                );
              })}
              <div style={{ height: '50%' }} aria-hidden="true" />
            </>
          ) : (
            <div style={{ color: textDimmed, fontSize: 18, padding: 40 }}>
              {currentSong ? 'Pas de paroles pour ce morceau' : 'En attente d\'un morceau...'}
            </div>
          )}
        </div>

        {/* ── Stage message banner ── */}
        {stageMessage && <StageMessageBanner message={stageMessage} />}
      </div>
    </div>
  );
}
