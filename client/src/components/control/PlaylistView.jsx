import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useSocket } from '../../contexts/SocketContext';
import { useLongPress } from '../../hooks/useLongPress';
import { useTouchDrag } from '../../hooks/useTouchDrag';
import Popup from '../shared/Popup';
import ContextMenu from '../shared/ContextMenu';
import TagFilter, { filterByTags } from '../shared/TagFilter';

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: fine) and (min-width: 769px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine) and (min-width: 769px)');
    const handler = (e) => setDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return desktop;
}

export default function PlaylistView({ playlistId, onNavigate }) {
  const { state } = useSocket();
  const isDesktop = useIsDesktop();
  const [playlist, setPlaylist] = useState(null);
  const [items, setItems] = useState([]);
  const [sortBy, setSortBy] = useState('position');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [popup, setPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [playlistPicker, setPlaylistPicker] = useState(null);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [selectedSongs, setSelectedSongs] = useState(new Set());
  const liveLock = state.liveLock;
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const dragFromEl = useRef(null);
  const dragOverEl = useRef(null);

  // Stable refs for callbacks used by useTouchDrag options
  const itemsRef = useRef(items);
  itemsRef.current = items;

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

  const handleShortPress = useCallback((item) => {
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
  }, [state.queue]);

  const handleLongPress = useCallback((item, e) => {
    const x = e?.touches?.[0]?.clientX || e?.clientX || 200;
    const y = e?.touches?.[0]?.clientY || e?.clientY || 200;
    setContextMenu({
      x, y,
      items: [
        { label: 'Ajouter à une playlist', onClick: () => { api.get('/playlists').then(setAllPlaylists).catch(() => {}); setPlaylistPicker({ songId: item.song_id, title: item.title }); } },
        { label: 'Supprimer de la playlist', onClick: () => { api.delete(`/playlists/${playlistId}/items/${item.id}`).then(loadItems); } },
        { separator: true },
        { label: 'Éditer les paroles', onClick: () => onNavigate('lyrics', { songId: item.song_id }) },
        { label: 'Ouvrir la synchro', onClick: () => onNavigate('sync', { songId: item.song_id }) },
      ],
    });
  }, [playlistId, onNavigate]);

  const addToPlaylist = (targetPlaylistId, songId) => {
    api.post(`/playlists/${targetPlaylistId}/items`, { songId }).catch(() => {});
    setPlaylistPicker(null);
  };

  // ── Multi-select (Desktop only) ──
  const toggleSelect = (songId) => {
    setSelectedSongs(prev => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const clearSelection = () => setSelectedSongs(new Set());

  useEffect(() => { clearSelection(); }, [search, selectedTags, sortBy, sortDir, playlistId]);

  // ── Touch drag (mobile) with integrated tap + context menu ──
  const touchDrag = useTouchDrag(
    useCallback((fromIdx, toIdx) => {
      const item = itemsRef.current[fromIdx];
      if (!item) return;
      api.post(`/playlists/${playlistId}/items/${item.id}/move`, {
        newPosition: toIdx,
      }).then(loadItems).catch(() => {});
    }, [playlistId]),
    {
      onTap: useCallback((idx) => {
        const item = itemsRef.current[idx];
        if (item) handleShortPress(item);
      }, [handleShortPress]),
      onContextMenu: useCallback((idx, x, y) => {
        const item = itemsRef.current[idx];
        if (item) handleLongPress(item, { clientX: x, clientY: y });
      }, [handleLongPress]),
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
    if (dragItem.current === dragOverItem.current) return;
    const item = items[dragItem.current];
    if (!item) return;
    api.post(`/playlists/${playlistId}/items/${item.id}/move`, {
      newPosition: dragOverItem.current,
    }).then(loadItems).catch(() => {});
    dragItem.current = null;
    dragOverItem.current = null;
  };
  const handleDragEnd = () => {
    cleanupDragClasses();
    dragItem.current = null;
    dragOverItem.current = null;
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

  const addBatchToQueue = async (position) => {
    const songIds = filteredItems
      .filter(item => selectedSongs.has(item.song_id))
      .map(item => item.song_id);
    if (songIds.length === 0) return;
    try {
      await api.post('/queue/add-batch', { songIds, position });
    } catch {}
    clearSelection();
  };

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
            {isDesktop && (
              <th style={{ width: 36, padding: '0 4px' }}>
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && filteredItems.every(item => selectedSongs.has(item.song_id))}
                  onChange={() => {
                    if (filteredItems.every(item => selectedSongs.has(item.song_id))) {
                      clearSelection();
                    } else {
                      setSelectedSongs(new Set(filteredItems.map(item => item.song_id)));
                    }
                  }}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
                  title="Tout sélectionner"
                />
              </th>
            )}
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
        <tbody data-drag-list={filteredItems.length}>
          {filteredItems.map((item, idx) => (
            <PlaylistItemRow
              key={item.id}
              item={item}
              idx={idx}
              canDrag={effectiveCanDrag}
              onDragStart={(e) => handleDragStart(idx, e)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              dragRowHandlers={touchDrag.rowTouchHandlers(idx)}
              isTouching={touchDrag.isTouching}
              onShortPress={() => handleShortPress(item)}
              onLongPress={(e) => handleLongPress(item, e)}
              selected={selectedSongs.has(item.song_id)}
              onToggleSelect={toggleSelect}
              showCheckbox={isDesktop}
            />
          ))}
        </tbody>
      </table>

      {/* ── Floating selection bar (Desktop only) ── */}
      {isDesktop && selectedSongs.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '10px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 1000, fontSize: 13,
        }}>
          <span style={{ fontWeight: 600 }}>{selectedSongs.size} sélectionné{selectedSongs.size > 1 ? 's' : ''}</span>
          <button className="btn btn-sm btn-primary" onClick={() => addBatchToQueue('top')}>
            ⬆ En haut de file
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => addBatchToQueue('bottom')}>
            ⬇ En bas de file
          </button>
          <button className="btn btn-sm btn-secondary" onClick={clearSelection}>
            Annuler
          </button>
        </div>
      )}

      {filteredItems.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search || selectedTags.size > 0 ? 'Aucun résultat' : 'Playlist vide'}
        </div>
      )}

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}

      {playlistPicker && (
        <div className="popup-overlay" onClick={() => setPlaylistPicker(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="popup-title">Ajouter à une playlist</div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <div className="popup-actions">
                {allPlaylists.map(pl => (
                  <button
                    key={pl.id}
                    className="popup-action"
                    onClick={() => addToPlaylist(pl.id, playlistPicker.songId)}
                  >
                    {pl.name}
                  </button>
                ))}
                {allPlaylists.length === 0 && (
                  <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>Aucune playlist</div>
                )}
              </div>
            </div>
            <button
              className="popup-action"
              onClick={() => setPlaylistPicker(null)}
              style={{ color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaylistItemRow({ item, idx, canDrag, onDragStart, onDragOver, onDrop, onDragEnd, dragRowHandlers, isTouching, onShortPress, onLongPress, selected, onToggleSelect, showCheckbox }) {
  const touchUsedRef = useRef(false);

  // useLongPress — used ONLY when canDrag is false (non-drag mode: filtered, sorted, locked)
  const longPressHandlers = useLongPress(onShortPress, onLongPress);

  // Build event handlers based on drag mode
  let rowEvents;
  if (canDrag && dragRowHandlers) {
    // ── Drag mode ──
    // Touch: entirely handled by useTouchDrag (tap / drag / context menu)
    // Desktop: simple onClick (short press) + onContextMenu (right-click → long press)
    rowEvents = {
      onTouchStart: (e) => {
        touchUsedRef.current = true;
        dragRowHandlers.onTouchStart?.(e);
      },
      onTouchMove: dragRowHandlers.onTouchMove,
      onTouchEnd: (e) => {
        dragRowHandlers.onTouchEnd?.(e);
        // Reset touchUsed after synthetic click window
        setTimeout(() => { touchUsedRef.current = false; }, 400);
      },
      onClick: (e) => {
        if (touchUsedRef.current) return;
        onShortPress?.();
      },
      onContextMenu: (e) => {
        e.preventDefault();
        if (touchUsedRef.current) return;
        onLongPress?.(e);
      },
    };
  } else {
    // ── Non-drag mode ── useLongPress handles tap + long press for both touch and desktop
    rowEvents = longPressHandlers;
  }

  return (
    <tr
      data-drag-idx={idx}
      draggable={canDrag}
      onDragStart={(e) => { if (isTouching?.()) { e.preventDefault(); return; } onDragStart?.(e); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      {...rowEvents}
      style={{ cursor: 'pointer' }}
    >
      {showCheckbox && (
        <td style={{ width: 36, textAlign: 'center', padding: '0 4px' }}>
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(item.song_id); }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
        </td>
      )}
      <td>
        <span style={{ color: 'var(--text-muted)' }}>{item.position + 1}</span>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="song-title">{item.title}</span>
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
