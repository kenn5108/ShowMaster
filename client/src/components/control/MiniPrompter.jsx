import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';

/**
 * MiniStageBanner — compact version of PrompterView's StageMessageBanner.
 * Same logic: centered if short, continuous ticker if long.
 * Opaque colors (theme-independent).
 */
function MiniStageBanner({ message }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [needsScroll, setNeedsScroll] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !measureRef.current) return;
    const cw = containerRef.current.clientWidth;
    measureRef.current.style.animation = 'none';
    measureRef.current.style.paddingLeft = '0';
    const tw = measureRef.current.scrollWidth;
    setNeedsScroll(tw > cw - 16);
  }, [message]);

  const bannerStyle = {
    flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap',
    background: '#1a1306',
    borderTop: '1px solid #7a5a10',
    padding: '3px 0', position: 'relative', marginTop: 'auto',
    textAlign: needsScroll ? 'left' : 'center',
  };

  const textBase = { fontSize: 10, fontWeight: 600, color: '#f59e0b' };
  const measureStyle = { ...textBase, position: 'absolute', visibility: 'hidden', top: 0, left: 0 };

  if (!needsScroll) {
    return (
      <div ref={containerRef} style={bannerStyle}>
        <span ref={measureRef} style={measureStyle}>{message}</span>
        <span style={textBase}>{message}</span>
      </div>
    );
  }

  const GAP = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
  const tickerStyle = { ...textBase, display: 'inline-block', animation: 'marquee-ticker 14s linear infinite' };

  return (
    <div ref={containerRef} style={bannerStyle}>
      <span ref={measureRef} style={measureStyle}>{message}</span>
      <span style={tickerStyle}>{message}{GAP}{message}{GAP}</span>
    </div>
  );
}

/**
 * MiniPrompter — miniature clone of the real PrompterView (/prompter).
 *
 * Uses 100% inline styles (no CSS classes shared with PrompterView)
 * to guarantee zero cross-contamination between the two.
 *
 * Same visual logic as PrompterView:
 * - All lyrics rendered, smooth-scroll to center active line
 * - Top + bottom spacers for centering first/last lines
 * - Active line: white + rgba(233,69,96,0.75) background
 * - Non-active: rgba(255,255,255,0.55)
 * - Stage message banner at bottom
 *
 * Only difference: no header/topbar (title, artist, progress, toggle).
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
  const lyricsRef = useRef(null);
  const activeLineRef = useRef(null);
  const hasScrolledOnce = useRef(false);

  // ── Song resolution (same as PrompterView) ──
  const currentQueueItem = useMemo(() => {
    if (syncMode) return { song_id: syncMode.songId, title: syncMode.title, artist: syncMode.artist };
    return queue.find(q => q.is_current === 1) || queue[0] || null;
  }, [queue, syncMode]);

  const currentSongId = currentQueueItem?.song_id || null;

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
    hasScrolledOnce.current = false;

    api.get(`/lyrics/${currentSongId}`).then(data => {
      setLyrics((data.text || '').split('\n'));
    }).catch(() => setLyrics([]));
    api.get(`/lyrics/${currentSongId}/cues`).then(setCues).catch(() => setCues([]));
  }, [currentSongId]);

  // ── Active line from cues (same as PrompterView) ──
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

  // ── Auto-scroll active line to center (programmatic only) ──
  // Container uses overflow:hidden so user cannot scroll manually,
  // but scrollIntoView still works programmatically.
  useEffect(() => {
    if (!activeLineRef.current) return;
    const behavior = hasScrolledOnce.current ? 'smooth' : 'instant';
    activeLineRef.current.scrollIntoView({ behavior, block: 'center' });
    hasScrolledOnce.current = true;
  }, [activeLine]);
  useEffect(() => { hasScrolledOnce.current = false; }, [currentSongId]);

  // ── Colors (hardcoded dark mode, same as PrompterView dark) ──
  const textActive = '#fff';
  const textDimmed = 'rgba(255,255,255,0.55)';
  const activeLineBg = 'rgba(233,69,96,0.75)';

  const title = currentQueueItem?.title || null;

  return (
    <div style={{
      height: 220, flexShrink: 0, background: '#000',
      borderTop: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ── Minimal header: label + live dot ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px', flexShrink: 0,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'rgba(255,255,255,0.4)' }}>
          Prompteur
        </span>
        {syncMode && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', marginLeft: 2 }}>SYNCHRO</span>
        )}
        {rs.playerState === 'PLAYING' && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--success)', animation: 'pulse 1.5s infinite',
          }} />
        )}
      </div>

      {/* ── Lyrics area — display only, no user interaction ── */}
      {title ? (
        <div
          ref={lyricsRef}
          style={{
            flex: 1, overflow: 'hidden', padding: '0 8px',
            textAlign: 'center',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'none',
          }}
          onTouchStart={e => e.preventDefault()}
          onTouchMove={e => e.preventDefault()}
          onWheel={e => e.preventDefault()}
        >
          {lyrics.length > 0 ? (
            <>
              {/* Top spacer: allows first lines to be centered */}
              <div style={{ height: '50%' }} aria-hidden="true" />
              {lyrics.map((line, i) => {
                const isActive = i === activeLine;
                return (
                  <div
                    key={i}
                    ref={isActive ? activeLineRef : null}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      lineHeight: 1.5,
                      color: isActive ? textActive : textDimmed,
                      background: isActive ? activeLineBg : 'transparent',
                      borderRadius: isActive ? 4 : 0,
                      padding: '1px 6px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      transition: 'color 0.3s, background 0.3s',
                    }}
                  >
                    {line || '\u00A0'}
                  </div>
                );
              })}
              {/* Bottom spacer: allows last lines to be centered */}
              <div style={{ height: '50%' }} aria-hidden="true" />
            </>
          ) : (
            <div style={{ color: textDimmed, fontSize: 11, textAlign: 'center', padding: '16px 0' }}>
              Pas de paroles
            </div>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: textDimmed, fontSize: 12 }}>
          En attente...
        </div>
      )}

      {/* ── Stage message banner (compact, same logic as PrompterView) ── */}
      {stageMessage && (
        <MiniStageBanner message={stageMessage} />
      )}
    </div>
  );
}
