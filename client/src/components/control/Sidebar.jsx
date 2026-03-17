import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSocket } from '../../contexts/SocketContext';
import { api } from '../../utils/api';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import ContextMenu from '../shared/ContextMenu';

export default function Sidebar({ activeView, activePlaylistId, onNavigate, isOpen }) {
  const { state, socket } = useSocket();
  const [playlists, setPlaylists] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  // Rename state
  const [renaming, setRenaming] = useState(null); // playlist id being renamed
  const [renameValue, setRenameValue] = useState('');

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // playlist to delete

  // Context menu
  const [contextMenu, setContextMenu] = useState(null);

  // Touch guard — prevents synthetic click from triggering desktop onClick after touch
  const touchUsedRef = useRef(false);

  // Refs for HTML5 drag
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const dragFromEl = useRef(null);
  const dragOverEl = useRef(null);

  // Keep playlists ref stable for touch drag callback
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  const loadPlaylists = useCallback(() => {
    api.get('/playlists').then(setPlaylists).catch(() => {});
  }, []);

  useEffect(() => {
    loadPlaylists();
  }, [activeView, loadPlaylists]);

  // Real-time sync: update playlist list when any client creates/renames/deletes/moves
  useEffect(() => {
    const s = socket?.current;
    if (!s) return;
    const handler = (list) => setPlaylists(list);
    s.on('playlists:changed', handler);
    return () => s.off('playlists:changed', handler);
  }, [socket]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await api.post('/playlists', { name: newName.trim() });
      setNewName('');
      setCreating(false);
      loadPlaylists();
    } catch {}
  };

  // ── Context menu actions ──
  const openContextMenu = useCallback((idx, x, y) => {
    const pl = playlistsRef.current[idx];
    if (!pl) return;
    setContextMenu({
      x, y,
      items: [
        { label: 'Renommer', onClick: () => { setRenaming(pl.id); setRenameValue(pl.name); } },
        { separator: true },
        { label: 'Supprimer', onClick: () => { setDeleteConfirm(pl); } },
      ],
    });
  }, []);

  // ── Rename ──
  const handleRename = async (e) => {
    e.preventDefault();
    if (!renameValue.trim() || !renaming) return;
    try {
      await api.patch(`/playlists/${renaming}`, { name: renameValue.trim() });
      setRenaming(null);
      setRenameValue('');
      loadPlaylists();
    } catch {}
  };

  // ── Delete ──
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.delete(`/playlists/${deleteConfirm.id}`);
      setDeleteConfirm(null);
      loadPlaylists();
      // If the deleted playlist was active, navigate to library
      if (activePlaylistId === deleteConfirm.id) {
        onNavigate('library');
      }
    } catch {}
  };

  // ── Touch drag (mobile/tablet) ──
  const touchDrag = useTouchDrag(
    useCallback((fromIdx, toIdx) => {
      const pl = playlistsRef.current[fromIdx];
      if (!pl) return;
      api.post(`/playlists/${pl.id}/move`, { newPosition: toIdx }).then(setPlaylists).catch(() => {});
    }, []),
    {
      onTap: useCallback((idx) => {
        const pl = playlistsRef.current[idx];
        if (pl) onNavigate('playlist', { playlistId: pl.id });
      }, [onNavigate]),
      onContextMenu: useCallback((idx, x, y) => {
        openContextMenu(idx, x, y);
      }, [openContextMenu]),
    }
  );

  // ── HTML5 drag (desktop) ──
  const cleanupDragClasses = () => {
    if (dragFromEl.current) { dragFromEl.current.classList.remove('touch-dragging'); dragFromEl.current = null; }
    if (dragOverEl.current) { dragOverEl.current.classList.remove('touch-drag-over', 'touch-drag-over-above'); dragOverEl.current = null; }
  };

  const handleDragStart = (idx, e) => {
    dragItem.current = idx;
    const row = e.currentTarget;
    row.classList.add('touch-dragging');
    dragFromEl.current = row;
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragItem.current === null) return;
    dragOverItem.current = idx;
    if (dragOverEl.current) dragOverEl.current.classList.remove('touch-drag-over', 'touch-drag-over-above');
    const row = e.currentTarget;
    const rect = row.getBoundingClientRect();
    const insertBefore = e.clientY < rect.top + rect.height / 2;
    const effectiveIdx = insertBefore ? idx : idx + 1;
    if (effectiveIdx !== dragItem.current && effectiveIdx !== dragItem.current + 1) {
      row.classList.add(insertBefore ? 'touch-drag-over-above' : 'touch-drag-over');
    }
    dragOverEl.current = row;
  };

  const handleDrop = () => {
    cleanupDragClasses();
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) { dragItem.current = null; dragOverItem.current = null; return; }
    const pl = playlists[dragItem.current];
    if (!pl) { dragItem.current = null; dragOverItem.current = null; return; }
    api.post(`/playlists/${pl.id}/move`, { newPosition: dragOverItem.current }).then(setPlaylists).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragEnd = () => {
    cleanupDragClasses();
    dragItem.current = null;
    dragOverItem.current = null;
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
          Bibliothèque
        </div>
        <div
          className={`sidebar-item sidebar-item-secondary ${activeView === 'queue' ? 'active' : ''}`}
          onClick={() => onNavigate('queue')}
        >
          File (vue complète)
        </div>
        <div
          className={`sidebar-item ${activeView === 'history' ? 'active' : ''}`}
          onClick={() => onNavigate('history')}
        >
          Historique
        </div>
      </div>

      {/* Playlists */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Playlists
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setCreating(true)}
            style={{ fontSize: 10, padding: '2px 8px' }}
          >
            + Nouvelle
          </button>
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

        <div data-drag-list={playlists.length}>
          {playlists.map((pl, idx) => {
            const handlers = touchDrag.rowTouchHandlers(idx);
            return (
              <div
                key={pl.id}
                data-drag-idx={idx}
                draggable
                className={`sidebar-item sidebar-playlist-item ${activeView === 'playlist' && activePlaylistId === pl.id ? 'active' : ''}`}
                onDragStart={(e) => { if (touchDrag.isTouching()) { e.preventDefault(); return; } handleDragStart(idx, e); }}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => { touchUsedRef.current = true; handlers.onTouchStart?.(e); }}
                onTouchMove={handlers.onTouchMove}
                onTouchEnd={(e) => { handlers.onTouchEnd?.(e); setTimeout(() => { touchUsedRef.current = false; }, 400); }}
                onClick={() => {
                  if (touchUsedRef.current) return;
                  onNavigate('playlist', { playlistId: pl.id });
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (touchUsedRef.current) return;
                  openContextMenu(idx, e.clientX, e.clientY);
                }}
              >
                {pl.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom */}
      <div className="sidebar-section settings-section">
        <div className="sidebar-title">Système</div>
        <div
          className={`sidebar-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          Réglages
        </div>
        <div
          className={`sidebar-item ${activeView === 'logs' ? 'active' : ''}`}
          onClick={() => onNavigate('logs')}
        >
          Logs
        </div>
      </div>

      {/* Rename modal */}
      {renaming && (
        <div className="popup-overlay" onClick={() => setRenaming(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-title">Renommer la playlist</div>
            <form onSubmit={handleRename}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                style={{ width: '100%', padding: '8px 10px', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setRenaming(null)}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={!renameValue.trim()}>
                  Renommer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="popup-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-title">Supprimer la playlist</div>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
              Supprimer « {deleteConfirm.name} » ? Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDeleteConfirm(null)}>
                Annuler
              </button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleDelete}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </nav>
  );
}
