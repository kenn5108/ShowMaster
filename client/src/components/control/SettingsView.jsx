import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';

export default function SettingsView() {
  const { state, startUpdateOverlay } = useSocket();
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);

  // ── Update state ──
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    api.get('/settings').then(setSettings).catch(() => {});
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    await api.patch('/settings', settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCloseSession = async () => {
    if (!window.confirm('Fermer la session ? (uniquement si file vide et rien en lecture)')) return;
    try {
      await api.post('/session/close');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSyncLibrary = async () => {
    try {
      const result = await api.post('/library/sync');
      alert(`Synchronisation terminée : ${result.synced} compositions`);
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  };

  // ── Sync offset ──
  const currentOffset = state.syncOffsetMs || 0;

  const handleOffsetChange = async (delta) => {
    const newValue = currentOffset + delta;
    // Clamp to reasonable range: -5000 to +5000
    const clamped = Math.max(-5000, Math.min(5000, newValue));
    await api.patch('/settings', { sync_offset_ms: String(clamped) });
  };

  const handleOffsetReset = async () => {
    await api.patch('/settings', { sync_offset_ms: '0' });
  };

  // ── Update check ──
  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    setUpdateError('');
    try {
      const result = await api.get('/update/check');
      setUpdateStatus(result);
    } catch (err) {
      setUpdateStatus('error');
      setUpdateError(err.message || 'Erreur de vérification');
    }
  };

  const handleApplyUpdate = async () => {
    setUpdating(true);
    setUpdateError('');
    try {
      await api.post('/update/apply');
      // Trigger overlay immediately from here (guaranteed, no socket dependency)
      startUpdateOverlay();
    } catch (err) {
      setUpdating(false);
      setUpdateError(err.message || 'Erreur lors de la mise à jour');
    }
  };

  const formatOffset = (ms) => {
    const sign = ms >= 0 ? '+' : '';
    return `${sign}${ms} ms`;
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>Réglages</h2>
        <button className="btn btn-sm btn-primary" onClick={handleSave}>
          {saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* RocketShow connection */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Connexion RocketShow
        </h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Host</label>
            <input
              value={settings.rocketshow_host || ''}
              onChange={(e) => handleChange('rocketshow_host', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Port</label>
            <input
              value={settings.rocketshow_port || ''}
              onChange={(e) => handleChange('rocketshow_port', e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <span className={`connection-dot ${state.rocketshow?.connected ? 'connected' : 'disconnected'}`} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {state.rocketshow?.connected ? 'Connecté' : 'Déconnecté'}
            </span>
          </div>
        </div>
      </section>

      {/* ── Global sync offset ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Décalage global de synchro
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOffsetChange(-100)}>
            − 100 ms
          </button>
          <div style={{
            minWidth: 120, textAlign: 'center', padding: '6px 16px',
            background: 'var(--bg-secondary)', borderRadius: 6,
            fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
            color: currentOffset === 0 ? 'var(--text-secondary)' : currentOffset > 0 ? 'var(--success)' : 'var(--warning)',
          }}>
            {formatOffset(currentOffset)}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => handleOffsetChange(+100)}>
            + 100 ms
          </button>
          {currentOffset !== 0 && (
            <button className="btn btn-secondary btn-sm" onClick={handleOffsetReset} style={{ marginLeft: 4 }}>
              Réinitialiser
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Valeur positive = paroles en avance (anticiper). Valeur négative = paroles en retard (retarder).
          Ne modifie pas les timecodes enregistrés — correction de lecture uniquement.
        </p>
      </section>

      {/* Library sync from RocketShow */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Bibliothèque RocketShow
        </h3>
        <button className="btn btn-secondary" onClick={handleSyncLibrary}>
          Resynchroniser depuis RocketShow
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
          Importe les compositions depuis RocketShow dans la bibliothèque ShowMaster.
        </p>
      </section>

      {/* ── Update system ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Mises à jour
        </h3>

        {/* Current version */}
        {state.serverVersion && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            Version actuelle : <strong style={{ color: 'var(--text-primary)' }}>{state.serverVersion}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            className="btn btn-secondary"
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking' || updating}
          >
            {updateStatus === 'checking' ? 'Vérification...' : 'Rechercher les mises à jour'}
          </button>

          {updateStatus && updateStatus !== 'checking' && updateStatus !== 'error' && !updateStatus.upToDate && (
            <button
              className="btn btn-primary"
              onClick={handleApplyUpdate}
              disabled={updating}
            >
              {updating ? 'Mise à jour en cours...' : 'Appliquer la mise à jour'}
            </button>
          )}
        </div>

        {/* Status messages */}
        {updating && (
          <div style={{
            padding: '12px 16px', borderRadius: 6,
            background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: 13, color: '#f59e0b', marginBottom: 8,
          }}>
            Mise à jour en cours... Le serveur va redémarrer. La page se rechargera automatiquement.
          </div>
        )}

        {updateStatus && updateStatus !== 'checking' && updateStatus !== 'error' && updateStatus.upToDate && (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
            fontSize: 13, color: 'var(--success)',
          }}>
            L'application est à jour.
          </div>
        )}

        {updateStatus && updateStatus !== 'checking' && updateStatus !== 'error' && !updateStatus.upToDate && !updating && (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
            fontSize: 13, color: '#60a5fa',
          }}>
            <strong>{updateStatus.behindCount} mise{updateStatus.behindCount > 1 ? 's' : ''} à jour disponible{updateStatus.behindCount > 1 ? 's' : ''}</strong>
            {updateStatus.summary && (
              <pre style={{ marginTop: 8, fontSize: 11, opacity: 0.8, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {updateStatus.summary}
              </pre>
            )}
          </div>
        )}

        {(updateStatus === 'error' || updateError) && (
          <div style={{
            padding: '8px 12px', borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
            fontSize: 13, color: '#ef4444',
          }}>
            {updateError || 'Erreur lors de la vérification'}
          </div>
        )}
      </section>

      {/* Jukebox management is in the dedicated Jukebox view (sidebar) */}
      )}

      {/* Session */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Session
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
          Session en cours : <strong>{state.session?.venue}</strong>
        </p>
        <button className="btn btn-secondary" onClick={handleCloseSession} style={{ color: 'var(--warning)' }}>
          Fermer la session
        </button>
      </section>
    </div>
  );
}
