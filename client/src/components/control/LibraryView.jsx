import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useLongPress } from '../../hooks/useLongPress';
import { useSocket } from '../../contexts/SocketContext';
import Popup from '../shared/Popup';
import ContextMenu from '../shared/ContextMenu';

export default function LibraryView({ onNavigate }) {
  const { state } = useSocket();
  const [songs, setSongs] = useState([]);
  const [sortBy, setSortBy] = useState('title');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [popup, setPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [playlists, setPlaylists] = useState([]);

  const loadSongs = useCallback(async () => {
    try {
      const data = search
        ? await api.get(`/library?q=${encodeURIComponent(search)}`)
        : await api.get(`/library?sort=${sortBy}&dir=${sortDir}`);
      setSongs(data);
    } catch {}
  }, [sortBy, sortDir, search]);

  useEffect(() => { loadSongs(); }, [loadSongs]);

  useEffect(() => {
    api.get('/playlists').then(setPlaylists).catch(() => {});
  }, []);

  const toggleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const handleShortPress = (song) => {
    setPopup({
      title: `${song.title}`,
      song,
      actions: [
        { label: '⬆ Ajouter en haut de file', onClick: () => addToQueue(song.id, 'top') },
        { label: '⬇ Ajouter en bas de file', onClick: () => addToQueue(song.id, 'bottom') },
      ],
    });
  };

  const handleLongPress = (song, e) => {
    const x = e.touches?.[0]?.clientX || e.clientX || 200;
    const y = e.touches?.[0]?.clientY || e.clientY || 200;
    setContextMenu({
      x, y,
      items: [
        ...playlists.map(pl => ({
          label: `Ajouter à "${pl.name}"`,
          onClick: () => api.post(`/playlists/${pl.id}/items`, { songId: song.id }).catch(() => {}),
        })),
        { separator: true },
        { label: 'Éditer les paroles', onClick: () => onNavigate('lyrics', { songId: song.id }) },
        { label: 'Ouvrir la synchro', onClick: () => onNavigate('sync', { songId: song.id }) },
      ],
    });
  };

  const addToQueue = (songId, position) => {
    api.post('/queue/add', { songId, position }).catch(() => {});
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>Bibliothèque</h2>
        <button className="btn btn-sm btn-secondary" onClick={() => api.post('/library/sync').then(loadSongs)}>
          Sync RocketShow
        </button>
      </div>

      <input
        className="search-input"
        type="text"
        placeholder="Rechercher un titre ou artiste..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      <table className="song-table">
        <thead>
          <tr>
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
          {songs.map(song => (
            <SongRow
              key={song.id}
              song={song}
              onShortPress={() => handleShortPress(song)}
              onLongPress={(e) => handleLongPress(song, e)}
            />
          ))}
        </tbody>
      </table>

      {songs.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search ? 'Aucun résultat' : 'Bibliothèque vide — synchronisez avec RocketShow'}
        </div>
      )}

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}
    </div>
  );
}

function SongRow({ song, onShortPress, onLongPress }) {
  const tags = tryParseJson(song.tags, []);
  const pressHandlers = useLongPress(onShortPress, onLongPress);

  return (
    <tr {...pressHandlers} style={{ cursor: 'pointer' }}>
      <td>
        <div className="song-title">{song.title}</div>
        <div className="song-meta">
          {tags.map((t, i) => <span key={i} className="badge">{t}</span>)}
          {song.key_signature && <span className="badge badge-key">{song.key_signature}</span>}
          {song.bpm && <span className="badge badge-bpm">{song.bpm} BPM</span>}
        </div>
      </td>
      <td><span className="song-artist">{song.artist || '—'}</span></td>
      <td style={{ textAlign: 'right' }}>
        <span className="song-duration">{formatTime(song.duration_ms)}</span>
      </td>
    </tr>
  );
}

function tryParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : str || fallback; } catch { return fallback; }
}
