import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useSocket } from '../../contexts/SocketContext';
import { useLongPress } from '../../hooks/useLongPress';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import Popup from '../shared/Popup';
import ContextMenu from '../shared/ContextMenu';
import TagFilter, { filterByTags } from '../shared/TagFilter';

export default function PlaylistView({ playlistId, onNavigate }) {
  const { state } = useSocket();
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [sortBy, setSortBy] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [popup, setPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const liveLock = state.liveLock;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  useEffect(() => {
    if (!playlistId) return;
    api.get(`/playlists/${playlistId}`).then(setPlaylist).catch(() => {});
    loadItems();
    // Reset filters when switching playlists
    setSearch('');
    setSelectedTags(new Set());
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

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const clearTags = () => setSelectedTags(new Set());

  const canDrag = sortBy === 'position' && !liveLock;

  // ── Touch drag (mobile) ──
  const touchDrag = useTouchDrag(useCallback((fromIdx, toIdx) => {
    const item = items[fromIdx];
    if (!item) return;
    api.post(`/playlists/${playlistId}/items/${item.id}/move`, {
      newPosition: toIdx,
    }).then(loadItems).catch(() => {});
  }, [items, playlistId]));

  // ── HTML5 drag (desktop) ──
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
      api.post('/queue/add', { songId: item.song_id, position: 'bottom' }).catch(() => {});
    } else {
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

  // Apply text search + tag filters
  let filteredItems = items;
  if (search) {
    const q = search.toLowerCase();
    filteredItems = filteredItems.filter(item =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.artist || '').toLowerCase().includes(q)
    );
  }
  filteredItems = filterByTags(filteredItems, selectedTags);

  if (!playlist) return <div style={{ padding: 40, color: 'var(--text-muted)' }}>Chargement...</div>;

  const effectiveCanDrag = canDrag && !search && selectedTags.size === 0;

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

      <input
        className="search-input"
        type="text"
        placeholder="Rechercher dans la playlist..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      <TagFilter
        items={items}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClear={clearTags}
      />

      <table className="song-table">
        <thead>
          <tr>
            <th style={{ width: 50 }} onClick={() => toggleSort('position')}>
              # {sortBy === 'position' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th onClick={() => toggleSort('title')}>
              Titre {sortBy === 'title' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th onClick={() => toggleSort('artist')}>
              Artiste {sortBy === 'artist' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th style={{ width: 70, textAlign: 'right' }}>Durée</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item, idx) => (
            <PlaylistItemRow
              key={item.id}
              item={item}
              idx={idx}
              canDrag={effectiveCanDrag}
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              dragRowHandlers={touchDrag.rowTouchHandlers(idx)}
              onShortPress={() => handleShortPress(item)}
              onLongPress={(e) => handleLongPress(item, e)}
            />
          ))}
        </tbody>
      </table>

      {filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search || selectedTags.size > 0 ? 'Aucun résultat' : 'Playlist vide'}
        </div>
      )}

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

function PlaylistItemRow({ item, idx, canDrag, onDragStart, onDragOver, onDrop, dragRowHandlers, onShortPress, onLongPress }) {
  const tags = tryParseJson(item.tags, []);
  const pressHandlers = useLongPress(onShortPress, onLongPress);

  // Merge touch handlers: both useLongPress and useTouchDrag need touch events.
  // Row-level drag handlers are only active when canDrag is true.
  const mergedHandlers = { ...pressHandlers };
  if (canDrag && dragRowHandlers) {
    const origTouchStart = pressHandlers.onTouchStart;
    const origTouchMove = pressHandlers.onTouchMove;
    const origTouchEnd = pressHandlers.onTouchEnd;
    mergedHandlers.onTouchStart = (e) => { origTouchStart?.(e); dragRowHandlers.onTouchStart?.(e); };
    mergedHandlers.onTouchMove = (e) => { origTouchMove?.(e); dragRowHandlers.onTouchMove?.(e); };
    mergedHandlers.onTouchEnd = (e) => { origTouchEnd?.(e); dragRowHandlers.onTouchEnd?.(e); };
  }

  return (
    <tr
      data-drag-idx={idx}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      {...mergedHandlers}
      style={{ cursor: 'pointer' }}
    >
      <td>
        {canDrag && (
          <span className="drag-handle">⠿</span>
        )}
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
