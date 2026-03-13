import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';

export default function LyricsEditor({ songId, onNavigate }) {
  const [song, setSong] = useState(null);
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!songId) return;
    api.get(`/library/${songId}`).then(setSong).catch(() => {});
    api.get(`/lyrics/${songId}`).then(data => setText(data.text || '')).catch(() => {});
  }, [songId]);

  const handleSave = async () => {
    await api.put(`/lyrics/${songId}`, { text });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!songId) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        Sélectionnez un morceau pour éditer les paroles
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>
          Paroles — {song?.title || '...'}
        </h2>
        <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('sync', { songId })}>
          Ouvrir synchro
        </button>
        <button className="btn btn-sm btn-primary" onClick={handleSave}>
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Collez ou tapez les paroles ici..."
        style={{
          width: '100%',
          minHeight: 400,
          resize: 'vertical',
          fontFamily: 'monospace',
          fontSize: 14,
          lineHeight: 1.6,
          padding: 16,
          borderRadius: 8,
        }}
      />

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        {text.split('\n').filter(l => l.trim()).length} lignes
      </div>
    </div>
  );
}
