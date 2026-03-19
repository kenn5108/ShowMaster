import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { formatTime } from '../../utils/format';
import { useLongPress } from '../../hooks/useLongPress';
import { useSocket } from '../../contexts/SocketContext';
import Popup from '../shared/Popup';
import ContextMenu from '../shared/ContextMenu';
import TagFilter, { filterByTags } from '../shared/TagFilter';

// Desktop = fine pointer + wide screen (no touch tablets)
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

export default function LibraryView({ onNavigate }) {
  const { state } = useSocket();
  const isDesktop = useIsDesktop();
  const [songs, setSongs] = useState([]);
  const [sortBy, setSortBy] = useState('title');
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState(new Set());
  const [popup, setPopup] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [playlistPicker, setPlaylistPicker] = useState(null);
  const [selectedSongs, setSelectedSongs] = useState(new Set());

  // Sync result state
  const [syncResult, setSyncResult] = useState(null);
  const [reassociateModal, setReassociateModal] = useState(null);
  const [reassociateSearch, setReassociateSearch] = useState('');
  const [reassociateError, setReassociateError] = useState(null);

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

  const toggleTag = (tag) => {
    setSelectedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const clearTags = () => setSelectedTags(new Set());

  const filteredSongs = filterByTags(songs, selectedTags);

  // ── Sync ──
  const handleSync = async () => {
    try {
      const result = await api.post('/library/sync');
      await loadSongs();

      if (result.missingSongs?.length > 0 && result.newSongs?.length > 0) {
        setSyncResult(result);
      } else if (result.missingSongs?.length > 0) {
        setSyncResult({ ...result, message: `${result.missingSongs.length} chanson(s) manquante(s) dans RocketShow.` });
      } else {
        setSyncResult(null);
      }
    } catch {}
  };

  // ── Short press: add to queue (blocked for unavailable) ──
  const handleShortPress = (song) => {
    if (!song.rs_available) {
      handleMissingPress(song);
      return;
    }
    const queue = state.queue || [];
    if (queue.length === 0) {
      addToQueue(song.id, 'bottom');
    } else {
      setPopup({
        title: song.title,
        actions: [
          { label: '\u2B06 Ajouter en haut de file', onClick: () => addToQueue(song.id, 'top') },
          { label: '\u2B07 Ajouter en bas de file', onClick: () => addToQueue(song.id, 'bottom') },
        ],
      });
    }
  };

  // ── Long press: context menu ──
  const handleLongPress = (song, e) => {
    const x = e.touches?.[0]?.clientX || e.clientX || 200;
    const y = e.touches?.[0]?.clientY || e.clientY || 200;

    if (!song.rs_available) {
      handleMissingContextMenu(song, x, y);
      return;
    }

    const items = [
      { label: 'Ajouter à une playlist', onClick: () => { api.get('/playlists').then(setPlaylists).catch(() => {}); setPlaylistPicker({ songId: song.id }); } },
      { separator: true },
      { label: 'Éditer les paroles', onClick: () => onNavigate('lyrics', { songId: song.id }) },
      { label: 'Ouvrir la synchro', onClick: () => onNavigate('sync', { songId: song.id }) },
    ];

    // Jukebox toggle (only if plugin installed)
    if (state.plugins?.some(p => p.name === 'jukebox')) {
      const isVisible = song.jukebox_visible !== 0;
      items.push(
        { separator: true },
        {
          label: isVisible ? 'Masquer du Jukebox' : 'Publier sur Jukebox',
          onClick: async () => {
            await api.patch(`/plugins/jukebox/songs/${song.id}/visible`, { visible: !isVisible });
            loadSongs();
          },
        }
      );
    }

    setContextMenu({ x, y, items });
  };

  // ── Missing song: short press ──
  const handleMissingPress = (song) => {
    setPopup({
      title: `${song.title} (manquante)`,
      actions: [
        { label: 'Réassocier à une chanson RocketShow', onClick: () => openReassociateForSong(song) },
        { label: 'Supprimer définitivement', onClick: () => confirmDeleteSong(song) },
        { label: 'Laisser en attente', onClick: () => {} },
      ],
    });
  };

  // ── Missing song: context menu ──
  const handleMissingContextMenu = (song, x, y) => {
    setContextMenu({
      x, y,
      items: [
        { label: 'Réassocier à une chanson RS', onClick: () => openReassociateForSong(song) },
        { label: 'Supprimer définitivement', onClick: () => confirmDeleteSong(song) },
        { separator: true },
        { label: 'Éditer les paroles', onClick: () => onNavigate('lyrics', { songId: song.id }) },
        { label: 'Ouvrir la synchro', onClick: () => onNavigate('sync', { songId: song.id }) },
      ],
    });
  };

  // ── Reassociate: open picker for a single missing song ──
  const openReassociateForSong = async (song) => {
    try {
      // Fetch suggestions from backend for this specific song
      const suggestions = await api.get(`/library/${song.id}/suggestions`);
      setReassociateModal({
        missingSong: song,
        suggestions: suggestions || [],
        showManualSearch: false,
      });
      setReassociateSearch('');
      setReassociateError(null);
    } catch {
      // Fallback: open with empty suggestions, show manual search directly
      setReassociateModal({
        missingSong: song,
        suggestions: [],
        showManualSearch: true,
      });
      setReassociateSearch('');
      setReassociateError(null);
    }
  };

  // ── Reassociate: confirm ──
  const handleReassociate = async (oldSongId, newSongId) => {
    setReassociateError(null);
    try {
      await api.post(`/library/${oldSongId}/reassociate`, { newSongId });
      setReassociateModal(null);
      setSyncResult(null);
      await loadSongs();
    } catch (err) {
      console.error('Reassociate failed:', err);
      setReassociateError(err.message || 'Erreur lors de la réassociation');
    }
  };

  // ── Delete song ──
  const confirmDeleteSong = (song) => {
    setPopup({
      title: `Supprimer « ${song.title} » ?`,
      actions: [
        {
          label: 'Confirmer la suppression',
          onClick: async () => {
            try {
              await api.delete(`/library/${song.id}`);
              await loadSongs();
            } catch {}
          },
        },
      ],
    });
  };

  const addToPlaylist = (playlistId, songId) => {
    api.post(`/playlists/${playlistId}/items`, { songId }).catch(() => {});
    setPlaylistPicker(null);
  };

  const addToQueue = (songId, position) => {
    api.post('/queue/add', { songId, position }).catch(() => {});
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

  // Clear selection when search/tags/sort change
  useEffect(() => { clearSelection(); }, [search, selectedTags, sortBy, sortDir]);

  const addBatchToQueue = async (position) => {
    // Collect selected song IDs in display order
    const songIds = filteredSongs
      .filter(s => selectedSongs.has(s.id) && s.rs_available)
      .map(s => s.id);
    if (songIds.length === 0) return;
    try {
      await api.post('/queue/add-batch', { songIds, position });
    } catch {}
    clearSelection();
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>Bibliothèque</h2>
        <button className="btn btn-sm btn-secondary" onClick={handleSync}>
          Sync RocketShow
        </button>
      </div>

      {/* Sync result banner */}
      {syncResult && (syncResult.missingSongs?.length > 0 || syncResult.newSongs?.length > 0) && (
        <div style={{
          background: 'rgba(233,69,96,0.12)',
          border: '1px solid rgba(233,69,96,0.3)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 12,
          fontSize: 13,
          lineHeight: 1.6,
        }}>
          {syncResult.missingSongs?.length > 0 && syncResult.newSongs?.length > 0 ? (
            <>
              <strong>{syncResult.missingSongs.length} chanson(s) manquante(s)</strong> et <strong>{syncResult.newSongs.length} nouvelle(s)</strong> détectée(s).
              {' '}Il peut s'agir de renommages dans RocketShow.
              {syncResult.suggestions?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong>Suggestions de rapprochement :</strong>
                  {syncResult.suggestions.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--text-muted)' }}>« {s.missingTitle} »</span>
                      <span>→</span>
                      <span>« {s.newTitle} »</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({s.score}%)</span>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ padding: '2px 10px', fontSize: 11 }}
                        onClick={() => handleReassociate(s.missingSongId, s.newSongId)}
                      >
                        Associer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <span>{syncResult.message}</span>
          )}
          <div style={{ marginTop: 8 }}>
            <button
              className="btn btn-sm btn-secondary"
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setSyncResult(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      <input
        className="search-input"
        type="text"
        placeholder="Rechercher un titre ou artiste..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      <TagFilter
        items={songs}
        selectedTags={selectedTags}
        onToggleTag={toggleTag}
        onClear={clearTags}
      />

      <table className="song-table song-table--browse">
        <thead>
          <tr>
            {isDesktop && (
              <th style={{ width: 32, padding: '0 6px' }}>
                <input
                  type="checkbox"
                  className="song-select-check"
                  checked={filteredSongs.length > 0 && filteredSongs.every(s => selectedSongs.has(s.id))}
                  onChange={() => {
                    if (filteredSongs.every(s => selectedSongs.has(s.id))) {
                      clearSelection();
                    } else {
                      setSelectedSongs(new Set(filteredSongs.map(s => s.id)));
                    }
                  }}
                  title="Tout sélectionner"
                />
              </th>
            )}
            <th className="col-title-browse" onClick={() => toggleSort('title')}>
              Titre {sortBy === 'title' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th className="col-artist-browse" onClick={() => toggleSort('artist')}>
              Artiste {sortBy === 'artist' && (sortDir === 'asc' ? '\u2191' : '\u2193')}
            </th>
            <th className="col-duration-browse" style={{ width: 70, textAlign: 'right' }}>Durée</th>
          </tr>
        </thead>
        <tbody>
          {filteredSongs.map(song => (
            <SongRow
              key={song.id}
              song={song}
              onShortPress={() => handleShortPress(song)}
              onLongPress={(e) => handleLongPress(song, e)}
              selected={selectedSongs.has(song.id)}
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

      {filteredSongs.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {search || selectedTags.size > 0 ? 'Aucun résultat' : 'Bibliothèque vide — synchronisez avec RocketShow'}
        </div>
      )}

      {popup && <Popup {...popup} onClose={() => setPopup(null)} />}
      {contextMenu && <ContextMenu {...contextMenu} onClose={() => setContextMenu(null)} />}

      {/* Playlist picker */}
      {playlistPicker && (
        <div className="popup-overlay" onClick={() => setPlaylistPicker(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
            <div className="popup-title">Ajouter à une playlist</div>
            <div style={{ overflow: 'auto', flex: 1 }}>
              <div className="popup-actions">
                {playlists.map(pl => (
                  <button key={pl.id} className="popup-action" onClick={() => addToPlaylist(pl.id, playlistPicker.songId)}>
                    {pl.name}
                  </button>
                ))}
                {playlists.length === 0 && (
                  <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>Aucune playlist</div>
                )}
              </div>
            </div>
            <button className="popup-action" onClick={() => setPlaylistPicker(null)} style={{ color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Reassociate modal */}
      {reassociateModal && (
        <div className="popup-overlay" onClick={() => setReassociateModal(null)}>
          <div className="popup" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column', maxWidth: 420 }}>
            <div className="popup-title">
              Réassocier « {reassociateModal.missingSong.title} »
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Les paroles et la synchro seront conservées.
            </p>

            {reassociateError && (
              <div style={{ background: 'rgba(233,69,96,0.15)', border: '1px solid rgba(233,69,96,0.4)', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#e94560' }}>
                {reassociateError}
              </div>
            )}

            <div style={{ overflow: 'auto', flex: 1 }}>
              {/* Auto-suggestions */}
              {reassociateModal.suggestions?.length > 0 && !reassociateModal.showManualSearch && (
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>
                    Suggestions automatiques
                  </div>
                  <div className="popup-actions">
                    {reassociateModal.suggestions.map(s => (
                      <button
                        key={s.songId}
                        className="popup-action"
                        onClick={() => handleReassociate(reassociateModal.missingSong.id, s.songId)}
                        style={{ textAlign: 'left' }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div>{s.title}</div>
                            {s.artist && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.artist}</div>}
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginLeft: 8, flexShrink: 0 }}>
                            {s.score}%
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {reassociateModal.suggestions?.length === 0 && !reassociateModal.showManualSearch && (
                <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  Aucune suggestion automatique
                </div>
              )}

              {/* Manual search toggle */}
              {!reassociateModal.showManualSearch && (
                <button
                  className="popup-action"
                  onClick={() => setReassociateModal(prev => ({ ...prev, showManualSearch: true }))}
                  style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13, textAlign: 'center' }}
                >
                  Choisir une autre chanson...
                </button>
              )}

              {/* Manual search */}
              {reassociateModal.showManualSearch && (
                <div>
                  <input
                    className="search-input"
                    type="text"
                    placeholder="Rechercher un titre ou artiste..."
                    value={reassociateSearch}
                    onChange={(e) => setReassociateSearch(e.target.value)}
                    autoFocus
                    style={{ marginBottom: 8, fontSize: 13 }}
                  />
                  <div className="popup-actions">
                    {songs
                      .filter(s => {
                        if (!s.rs_available || s.id === reassociateModal.missingSong.id) return false;
                        if (!reassociateSearch) return true;
                        const q = reassociateSearch.toLowerCase();
                        return (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q);
                      })
                      .map(c => (
                        <button
                          key={c.id}
                          className="popup-action"
                          onClick={() => handleReassociate(reassociateModal.missingSong.id, c.id)}
                          style={{ textAlign: 'left' }}
                        >
                          <div>{c.title}</div>
                          {c.artist && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.artist}</div>}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            <button className="popup-action" onClick={() => setReassociateModal(null)} style={{ color: 'var(--text-muted)', marginTop: 8, flexShrink: 0 }}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SongRow({ song, onShortPress, onLongPress, selected, onToggleSelect, showCheckbox }) {
  const pressHandlers = useLongPress(onShortPress, onLongPress);
  const missing = !song.rs_available;

  return (
    <tr
      {...pressHandlers}
      style={{ cursor: 'pointer', opacity: missing ? 0.45 : 1 }}
    >
      {showCheckbox && (
        <td style={{ width: 32, textAlign: 'center', padding: '0 6px' }}>
          <input
            type="checkbox"
            className="song-select-check"
            checked={!!selected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect?.(song.id); }}
            onClick={(e) => e.stopPropagation()}
          />
        </td>
      )}
      <td>
        <div className="song-info">
          <span className="song-title" style={
            state.plugins?.some(p => p.name === 'jukebox')
              ? { borderBottom: `2px solid ${song.jukebox_visible !== 0 ? 'var(--success)' : '#ef4444'}` }
              : undefined
          }>{song.title}</span>
          {missing && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>MANQUANTE</span>}
          {song.key_signature && <span className="badge badge-key">{song.key_signature}</span>}
          {song.bpm && <span className="badge badge-bpm">{song.bpm} BPM</span>}
        </div>
      </td>
      <td className="col-artist-browse"><span className="song-artist">{song.artist || '\u2014'}</span></td>
      <td className="col-duration-browse" style={{ textAlign: 'right' }}>
        <span className="song-duration">{formatTime(song.duration_ms)}</span>
      </td>
    </tr>
  );
}

function tryParseJson(str, fallback) {
  try { return typeof str === 'string' ? JSON.parse(str) : str || fallback; } catch { return fallback; }
}
