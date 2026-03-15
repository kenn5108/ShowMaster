import React, { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import Sidebar from './Sidebar';
import LibraryView from './LibraryView';
import PlaylistView from './PlaylistView';
import QueueView from './QueueView';
import HistoryView from './HistoryView';
import LyricsEditor from './LyricsEditor';
import SyncEditor from './SyncEditor';
import SettingsView from './SettingsView';
import LogsView from './LogsView';
import TransportBar from './TransportBar';
import MobileTransportBar from './MobileTransportBar';
import QueuePanel from './QueuePanel';
import MiniPrompter from './MiniPrompter';
import FocusPrompter from './FocusPrompter';

const VIEWS = {
  library: LibraryView,
  playlist: PlaylistView,
  queue: QueueView,
  history: HistoryView,
  lyrics: LyricsEditor,
  sync: SyncEditor,
  settings: SettingsView,
  logs: LogsView,
};

// Views that require playback to NOT be PLAYING
const PLAYBACK_GUARDED_VIEWS = new Set(['sync']);

export default function ControlLayout() {
  const { state, connected } = useSocket();
  const [activeView, setActiveView] = useState('library');
  const [viewProps, setViewProps] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [guardModal, setGuardModal] = useState(false);
  const [prompterFocus, setPrompterFocus] = useState(false);

  const navigate = (view, props = {}) => {
    // Guard: block sync editor while transport is PLAYING
    if (PLAYBACK_GUARDED_VIEWS.has(view)) {
      const playerState = state.rocketshow?.playerState;
      if (playerState === 'PLAYING') {
        setGuardModal(true);
        return;
      }
    }

    setActiveView(view);
    setViewProps(props);
    setSidebarOpen(false);
  };

  const ViewComponent = VIEWS[activeView] || LibraryView;

  // ── Block native context menu on interactive areas (touch long-press) ──
  // Allows it on real text-editing elements (input, textarea, contenteditable).
  useEffect(() => {
    const isEditable = (el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const handler = (e) => {
      const editable = isEditable(e.target);
      console.log(`[CL] document contextmenu — target=${e.target.tagName} editable=${editable} defaultPrevented=${e.defaultPrevented}`);
      if (!editable) e.preventDefault();
    };
    document.addEventListener('contextmenu', handler, { passive: false });
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // ── Wake Lock: keep screen on while the app is visible ──
  // Strategy 1: Wake Lock API (requires secure context — HTTPS or localhost)
  // Strategy 2: Invisible video loop fallback (works on HTTP, Android Chrome, Safari)
  useEffect(() => {
    let wakeLock = null;
    let video = null;
    let usingApi = false;

    const requestApi = async () => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') {
          wakeLock = await navigator.wakeLock.request('screen');
          usingApi = true;
          console.log('[WakeLock] Screen wake lock acquired via API');
          wakeLock.addEventListener('release', () => {
            console.log('[WakeLock] API lock released');
          });
        }
      } catch (err) {
        console.warn('[WakeLock] API failed:', err.message, '— falling back to video method');
        startVideoFallback();
      }
    };

    const startVideoFallback = () => {
      if (video) return; // already running
      try {
        video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.muted = true;
        video.loop = true;
        video.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
        // Tiny silent webm (base64) — ~200 bytes, plays silently in loop
        video.src = 'data:video/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////FUmpZpkq17GDD0JATYCGQ2hyb21lV0WGQ2hyb21lFlSua7+uvdeBAXPFh5JBjq1ZRLuXgQFVd2VibUWGRWFjIFRvb2xElSua18AAAAAAAAAAAABkAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAEVzc3MBAAAAAAAABwAAAk';
        document.body.appendChild(video);
        video.play().then(() => {
          console.log('[WakeLock] Video fallback active — screen will stay on');
        }).catch((e) => {
          console.warn('[WakeLock] Video fallback failed:', e.message);
        });
      } catch (e) {
        console.warn('[WakeLock] Video fallback error:', e.message);
      }
    };

    // Initial attempt
    if ('wakeLock' in navigator && window.isSecureContext) {
      requestApi();
    } else {
      if (!window.isSecureContext) {
        console.log('[WakeLock] Not a secure context (HTTP) — API unavailable, using video fallback');
      }
      startVideoFallback();
    }

    // Re-acquire on tab focus
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (usingApi) {
        requestApi();
      } else if (video && video.paused) {
        video.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLock?.release().catch(() => {});
      if (video) {
        video.pause();
        video.remove();
      }
    };
  }, []);

  // ── Fullscreen toggle ──
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <button
          className="btn-icon sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          ☰
        </button>
        <h1>ShowMaster</h1>
        <span className="header-venue">{state.session?.venue}</span>
        <div className="header-status">
          <span className={`connection-dot ${state.rocketshow?.connected ? 'connected' : 'disconnected'}`}
                title={state.rocketshow?.connected ? 'RocketShow connecté' : 'RocketShow déconnecté'} />
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}
                title={connected ? 'WebSocket connecté' : 'WebSocket déconnecté'} />
          {state.liveLock && <span className="lock-badge locked">LIVE</span>}
          <button
            className="btn-icon fullscreen-toggle"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          >
            {isFullscreen ? '⊗' : '⛶'}
          </button>
        </div>
      </header>

      {/* Body: sidebar + center + right panel */}
      <div className="app-body">
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        {rightPanelOpen && (
          <div className="right-panel-overlay" onClick={() => setRightPanelOpen(false)} />
        )}

        <Sidebar
          activeView={activeView}
          activePlaylistId={viewProps.playlistId}
          onNavigate={navigate}
          isOpen={sidebarOpen}
        />

        <main className="main-content">
          <ViewComponent {...viewProps} onNavigate={navigate} />
        </main>

        {/* Right panel: Queue + Mini Prompter */}
        <aside className={`right-panel ${rightPanelOpen ? 'open' : ''}`}>
          <QueuePanel />
          <div
            className="mini-prompter-wrapper"
            onClick={() => setPrompterFocus(f => !f)}
            title="Ouvrir le prompteur en mode focus"
          >
            <MiniPrompter />
          </div>
        </aside>

        {/* Focus prompter overlay — covers sidebar + center, NOT right panel */}
        {prompterFocus && <FocusPrompter onClose={() => setPrompterFocus(false)} />}
      </div>

      {/* Transport — desktop: full bar, mobile: compact fixed bar */}
      <TransportBar />
      <MobileTransportBar />

      {/* Guard modal — blocks sync/lyrics while playing */}
      {guardModal && (
        <div className="popup-overlay" onClick={() => setGuardModal(false)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-title">Lecture en cours</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Veuillez mettre en pause ou arrêter la lecture avant de synchroniser une chanson.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setGuardModal(false)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
