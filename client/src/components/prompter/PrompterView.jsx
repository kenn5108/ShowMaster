import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';

// ── Stage message: centered if short, continuous ticker if long ──
// Opaque colors → identical in dark and light mode (theme-independent).
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
    paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))',
    textAlign: needsScroll ? 'left' : 'center',
  };

  const textBase = {
    fontSize: 'clamp(18px, 2.5vw, 28px)',
    fontWeight: 700,
    color: BANNER_COLOR,
  };

  // Hidden element for measuring text width (no animation, no offset)
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

  // Continuous ticker: two copies so text loops without gap
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

export default function PrompterView() {
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
    // First scroll is instant so the line appears centered immediately
    const behavior = hasScrolledOnce.current ? 'smooth' : 'instant';
    activeRef.current.scrollIntoView({ behavior, block: 'center' });
    hasScrolledOnce.current = true;
  }, [activeLine]);
  // Reset on song change so next song also starts centered instantly
  useEffect(() => { hasScrolledOnce.current = false; }, [currentSongId]);

  // ── Smart font size: biggest that fits the longest line ──
  const [fontSize, setFontSize] = useState(28);
  const computeFontSize = useCallback(() => {
    if (!lyricsContainerRef.current || lyrics.length === 0) return;
    const container = lyricsContainerRef.current;
    const maxWidth = container.clientWidth - 48; // 24px padding each side
    if (maxWidth <= 0) return;

    // Find the longest non-empty line
    let longest = '';
    for (const line of lyrics) {
      if (line.length > longest.length) longest = line;
    }
    if (!longest) return;

    // Binary search for max font size that fits
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

  // ── Color scheme ──
  const bg = negativeMode ? '#f5f5f0' : '#000';
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

  return (
    <div style={{ minHeight: '100vh', height: '100dvh', background: bg, color: textActive, display: 'flex', flexDirection: 'column', overflow: 'hidden', transition: 'background 0.3s, color 0.3s' }}>
      {/* ── Header: current (left) + next (right) ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px 12px', paddingTop: `calc(max(16px, env(safe-area-inset-top, 16px)) + 8px)`, background: headerBg, borderBottom: `1px solid ${borderColor}`, flexShrink: 0, gap: 16 }}>
        {/* Left: current song */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {currentSong ? (
            <div style={{ fontSize: 18, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {syncMode && <span style={{ color: '#f59e0b', marginRight: 8 }}>SYNCHRO</span>}
              {currentSong.title}
              {currentSong.artist && <span style={{ fontWeight: 400, color: textMuted, marginLeft: 8 }}>— {currentSong.artist}</span>}
            </div>
          ) : (
            <div style={{ fontSize: 16, color: textMuted }}>En attente...</div>
          )}
        </div>
        {/* Right: next song + mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          {nextSong && (
            <div style={{ textAlign: 'right', minWidth: 0 }}>
              <div style={{ fontSize: 13, color: textActive, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, opacity: 0.7 }}>À suivre</div>
              <div style={{ fontSize: 17, color: textActive, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}>
                {nextSong.title}{nextSong.artist ? ` — ${nextSong.artist}` : ''}
              </div>
            </div>
          )}
          {/* Dark/light toggle */}
          <button
            onClick={() => setNegativeMode(m => !m)}
            style={{ width: 36, height: 36, borderRadius: '50%', background: toggleBg, color: toggleColor, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, transition: 'background 0.3s' }}
            title={negativeMode ? 'Mode sombre' : 'Mode clair'}
          >
            {negativeMode ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      {/* ── Visual progress bar (no controls) ── */}
      {currentSong && (
        <div style={{ height: 4, background: barTrack, flexShrink: 0 }}>
          <div style={{ height: '100%', background: accentBar, width: `${progress}%`, transition: 'width 0.3s linear', borderRadius: '0 2px 2px 0' }} />
        </div>
      )}

      {/* ── Lyrics ── */}
      <div ref={lyricsContainerRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 24px', textAlign: 'center', touchAction: 'none', overscrollBehavior: 'none', WebkitOverflowScrolling: 'auto' }}
        onTouchStart={e => e.preventDefault()}
        onTouchMove={e => e.preventDefault()}
      >
        {lyrics.length > 0 ? (
          <>
            {/* Top spacer: pushes first line to vertical center */}
            <div style={{ height: '50vh' }} aria-hidden="true" />
            {lyrics.map((line, idx) => {
              const isActive = idx === activeLine;
              return (
                <div
                  key={idx}
                  ref={isActive ? activeRef : null}
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
            {/* Bottom spacer: allows last line to stay centered */}
            <div style={{ height: '50vh' }} aria-hidden="true" />
          </>
        ) : (
          <div style={{ color: textDimmed, fontSize: 20, padding: 40 }}>
            {currentSong ? 'Pas de paroles pour ce morceau' : 'En attente d\'un morceau...'}
          </div>
        )}
      </div>

      {/* ── Stage message: centered if fits, scrolling if too long ── */}
      {stageMessage && (
        <StageMessageBanner message={stageMessage} />
      )}
    </div>
  );
}
