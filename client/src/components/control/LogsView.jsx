import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';

const LEVEL_COLORS = {
  info: 'var(--text-secondary)',
  warn: 'var(--warning)',
  error: 'var(--error)',
  debug: 'var(--text-muted)',
};

export default function LogsView() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadLogs();
    const timer = setInterval(loadLogs, 5000);
    return () => clearInterval(timer);
  }, [filter]);

  const loadLogs = () => {
    const params = filter ? `?level=${filter}&limit=200` : '?limit=200';
    api.get(`/logs${params}`).then(setLogs).catch(() => {});
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>Logs</h2>
        <div className="tabs">
          {['', 'info', 'warn', 'error'].map(level => (
            <button
              key={level}
              className={`tab ${filter === level ? 'active' : ''}`}
              onClick={() => setFilter(level)}
            >
              {level || 'Tous'}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.6,
        maxHeight: 'calc(100vh - 220px)',
        overflowY: 'auto',
      }}>
        {logs.map(log => (
          <div key={log.id} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
            <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>
              {new Date(log.created_at).toLocaleTimeString('fr-FR')}
            </span>
            <span style={{ color: LEVEL_COLORS[log.level] || 'var(--text-primary)', marginRight: 8, fontWeight: 600 }}>
              [{log.level.toUpperCase()}]
            </span>
            <span style={{ color: 'var(--accent)', marginRight: 8 }}>[{log.source}]</span>
            <span>{log.message}</span>
          </div>
        ))}

        {logs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Aucun log
          </div>
        )}
      </div>
    </div>
  );
}
