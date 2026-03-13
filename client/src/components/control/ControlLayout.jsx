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

  const navigate = (view, props = {}) => {
    setActiveView(view);
    setViewProps(props);
    setSidebarOpen(false);
  };

  const ViewComponent = VIEWS[activeView] || LibraryView;

  return (
    <div className="app-layout">
      {/* Header */}
      <header className="app-header">
        <button
          className="btn-icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{ fontSize: 24 }}
        >
          ☰
        </button>
        <h1>ShowMaster</h1>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {state.session?.venue}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`connection-dot ${state.rocketshow?.connected ? 'connected' : 'disconnected'}`}
                title={state.rocketshow?.connected ? 'RocketShow connecté' : 'RocketShow déconnecté'} />
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}
                title={connected ? 'WebSocket connecté' : 'WebSocket déconnecté'} />
          {state.liveLock && <span className="lock-badge locked">LIVE</span>}
        </div>
      </header>

      {/* Body */}
      <div className="app-body">
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}
        <Sidebar
          activeView={activeView}
          onNavigate={navigate}
          isOpen={sidebarOpen}
        />
        <main className="main-content">
          <ViewComponent {...viewProps} onNavigate={navigate} />
        </main>
      </div>

      {/* Transport */}
      <TransportBar />
    </div>
  );
}
