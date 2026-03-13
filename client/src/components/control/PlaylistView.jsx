import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useSocket } from '../../contexts/SocketContext';
import { useLongPress } from '../../hooks/useLongPress';
import Popup from '../shared/Popup';
import ContextMenu from '../shared/ContextMenu';

export default function PlaylistView({ playlistId, onNavigate }) {
  const { state } = useSocket();
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [sortBy, setSortBy] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [popup, setPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const liveLock = state.liveLock;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  useEffect(() => {
    if (!playlistId) return;
    api.get(`/playlists/${playlistId}`).then(setPlaylist).catch(() => {});
    loadItems();
  }, [playlistId, sortBy, sortDir]);

  const loadItems = () => {
    if (!playlistId) return;
    api.get(`/playlists/${playlistId}/items?sort=${sortBy}&dir=${sortDir}`).then(setItems).catch(() => {});
  };

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const canDrag = sortBy === 'position' && !liveLock;

  const handleDragStart = (idx) => { dragItem.current = idx; };
  const handleDragOver = (e, idx) => { e.preventDefault(); dragOverItem.current = idx; };
  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) return;
    const item = items[dragItem.current];
    if (!item) return;
    api.post(`/playlists/${playlistId}/items/${item.id}/move`, {
      newPosition: dragOverItem.current,
    }).then(loadItems).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleShortPress = (item) => {
    const queue = state.queue || [];
    if (queue.length === 0) {
      // File vide → ajout direct
      api.post('/queue/add', { songId: item.song_id, position: 'bottom' }).catch(() => {});
    } else {
      // File non vide → popup choix haut/bas
      setPopup({
        title: item.title,
        actions: [
          { label: '⬆ Ajouter en haut de file', onClick: () => api.post('/queue/add', { songId: item.song_id, position: 'top' }) },
          { label: '⬇ Ajouter en bas de file', onClick: () => api.post('/queue/add', { songId: item.song_id, position: 'bottom' }) },
        ],
      });
    }
  };

  const handleLongPress = (item, e) => {
    const x = e.touches?.[0]?.clientX || e.clientX || 200;
    const y = e.touches?.[0]?.clientY || e.clientY || 200;
    setContextMenu({
      x, y,
      items: [
        { label: 'Supprimer de la playlist', onClick: () => { api.delete(`/playlists/${playlistId}/items/${item.id}`).then(loadItems); } },
        { separator: true },
        { label: 'Éditer les paroles', onClick: () => onNavigate('lyrics', { songId: item.song_id }) },
        { label: 'Ouvrir la synchro', onClick: () => onNavigate('sync', { songId: item.song_id }) },
      ],
    });
  };

  if (!playlist) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>{playlist.name}</h2>
        {!liveLock && (
          <button
            className="btn btn-sm btn-primary"
            onClick={() => api.post('/queue/load-playlist', { playlistId }).catch(() => {})}
          >
            Charger en file
          </button>
        )}
      </div>

      <table className="song-table">
        <thead>
          <tr>
            <th style={{ width: 50 }} onClick={() => toggleSort('position')}>
              # {sortBy === 'position' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => toggleSort('title')}>
              Titre {sortBy === 'title' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => toggleSort('artist')}>
              Artiste {sortBy === 'artist' && (sortDir === 'asc' ? '↑' : '↓')}
            </th>
            <th style={{ width: 70, textAlign: 'right' }}>Durée</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <PlaylistItemRow
              key={item.id}
              item={item}
              idx={idx}
              canDrag={canDrag}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              onShortPress={() => handleShortPress(item)}
              onLongPress={(e) => handleLongPress(item, e)}
            />
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Playlist vide
        </div>
      )}

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

function PlaylistItemRow({ item, idx, canDrag, onDragStart, onDragOver, onDrop, onShortPress, onLongPress }) {
  const tags = tryParseJson(item.tags, []);
  const pressHandlers = useLongPress(onShortPress, onLongPress);

  return (
    <tr
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      {...pressHandlers}
      style={{ cursor: 'pointer' }}
    >
      <td>
        {canDrag && <span className="drag-handle">⠿</span>}
        {!canDrag && <span style={{ color: 'var(--text-muted)' }}>{idx + 1}</span>}
      </td>
      <td>
        <div className="song-title">{item.title}</div>
        <div className="song-meta">
          {tags.map((t, i) => <span key={i} className="badge">{t}</span>)}
          {item.key_signature && <span className="badge badge-key">{item.key_signature}</span>}
          {item.bpm && <span className="badge badge-bpm">{item.bpm} BPM</span>}
        </div>
      </td>
      <td><span className="song-artist">{item.artist || '—'}</span></td>
      <td style={{ textAlign: 'right' }}>
        <span className="song-duration">{formatTime(item.duration_ms)}</span>
      </td>
    </tr>
  );
}

function tryParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : str || fallback; } catch { return fallback; }
}
