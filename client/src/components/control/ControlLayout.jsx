import React, { useState } from 'react';
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

export default function ControlLayout() {
  const { state, connected } = useSocket();
  const [activeView, setActiveView] = useState('library');
  const [viewProps, setViewProps] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  const navigate = (view, props = {}) => {
    setActiveView(view);
    setViewProps(props);
    setSidebarOpen(false);
  };

  const ViewComponent = VIEWS[activeView] || LibraryView;
  const queueCount = state.queue?.length || 0;

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
        </div>
        {/* Mobile right-panel toggle */}
        <button
          className="btn-icon right-panel-toggle"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
        >
          <span>📋</span>
          {queueCount > 0 && <span className="right-panel-toggle-badge">{queueCount}</span>}
        </button>
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
          <MiniPrompter />
        </aside>
      </div>

      {/* Transport — desktop: full bar, mobile: compact fixed bar */}
      <TransportBar />
      <MobileTransportBar />
    </div>
  );
}
