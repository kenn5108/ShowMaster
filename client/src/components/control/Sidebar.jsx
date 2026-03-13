import React, { useEffect, useState } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';

export default function Sidebar({ activeView, onNavigate, isOpen }) {
  const { state } = useSocket();
  const [playlists, setPlaylists] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    api.get('/playlists').then(setPlaylists).catch(() => {});
  }, [activeView]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.post('/playlists', { name: newName.trim() });
      setNewName('');
      setCreating(false);
      const list = await api.get('/playlists');
      setPlaylists(list);
    } catch {}
  };

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      {/* Navigation */}
      <div className="sidebar-section">
        <div className="sidebar-title">Navigation</div>
        <div
          className={`sidebar-item ${activeView === 'library' ? 'active' : ''}`}
          onClick={() => onNavigate('library')}
        >
          🎵 Bibliothèque
        </div>
        <div
          className={`sidebar-item ${activeView === 'queue' ? 'active' : ''}`}
          onClick={() => onNavigate('queue')}
        >
          📋 File d'attente ({state.queue?.length || 0})
        </div>
        <div
          className={`sidebar-item ${activeView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          📖 Historique
        </div>
      </div>

      {/* Playlists */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Playlists
          {!state.liveLock && (
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setCreating(true)}
              style={{ fontSize: 10, padding: '2px 8px' }}
            >
              + Nouvelle
            </button>
          )}
        </div>

        {creating && (
          <form onSubmit={handleCreate} style={{ marginBottom: 8 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom..."
              autoFocus
              style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
              onBlur={() => { if (!newName.trim()) setCreating(false); }}
            />
          </form>
        )}

        {playlists.map(pl => (
          <div
            key={pl.id}
            className={`sidebar-item ${activeView === 'playlist' ? 'active' : ''}`}
            onClick={() => onNavigate('playlist', { playlistId: pl.id })}
          >
            🎶 {pl.name}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="sidebar-section settings-section">
        <div className="sidebar-title">Système</div>
        <div
          className={`sidebar-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          ⚙️ Réglages
        </div>
        <div
          className={`sidebar-item ${activeView === 'logs' ? 'active' : ''}`}
          onClick={() => onNavigate('logs')}
        >
          📝 Logs
        </div>
      </div>
    </nav>
  );
}
