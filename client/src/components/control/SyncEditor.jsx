import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';
import { formatTimeMMSS } from '../../utils/format';

export default function SyncEditor({ songId, onNavigate }) {
  const { state } = useSocket();
  const [song, setSong] = useState(null);
  const [lines, setLines] = useState([]);
  const [cues, setCues] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!songId) return;
    api.get(`/library/${songId}`).then(setSong).catch(() => {});
    api.get(`/lyrics/${songId}`).then(data => {
      setLines((data.text || '').split('\n'));
    }).catch(() => {});
    api.get(`/lyrics/${songId}/cues`).then(setCues).catch(() => {});
  }, [songId]);

  const getCueForLine = (lineIndex) => {
    return cues.find(c => c.line_index === lineIndex);
  };

  const handleTapSync = (lineIndex) => {
    const positionMs = state.rocketshow?.positionMs || 0;
    setCues(prev => {
      const existing = prev.findIndex(c => c.line_index === lineIndex);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], time_ms: positionMs };
        return updated;
      }
      return [...prev, { line_index: lineIndex, time_ms: positionMs, type: 'line' }]
        .sort((a, b) => a.time_ms - b.time_ms);
    });
  };

  const handleRemoveCue = (lineIndex) => {
    setCues(prev => prev.filter(c => c.line_index !== lineIndex));
  };

  const handleSave = async () => {
    await api.put(`/lyrics/${songId}/cues`, { cues });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!songId) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
        Sélectionnez un morceau pour la synchronisation
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>
          Synchro — {song?.title || '...'}
        </h2>
        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          Position: {formatTimeMMSS(state.rocketshow?.positionMs)}
        </span>
        <button className="btn btn-sm btn-secondary" onClick={() => onNavigate('lyrics', { songId })}>
          Éditer paroles
        </button>
        <button className="btn btn-sm btn-primary" onClick={handleSave}>
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
        Lancez la lecture puis cliquez sur chaque ligne au bon moment pour synchroniser.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {lines.map((line, idx) => {
          const cue = getCueForLine(idx);
          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderRadius: 6,
                background: cue ? 'rgba(233,69,96,0.1)' : 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => handleTapSync(idx)}
            >
              <span style={{
                minWidth: 60,
                fontSize: 11,
                color: cue ? 'var(--accent)' : 'var(--text-muted)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {cue ? formatTimeMMSS(cue.time_ms) : '—:——'}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: line.trim() ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                {line || '(vide)'}
              </span>
              {cue && (
                <button
                  className="btn btn-sm"
                  onClick={(e) => { e.stopPropagation(); handleRemoveCue(idx); }}
                  style={{ color: 'var(--error)', fontSize: 11 }}
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {lines.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Pas de paroles — ajoutez-les d'abord
        </div>
      )}
    </div>
  );
}
