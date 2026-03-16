import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { useSocket } from '../../contexts/SocketContext';

export default function SettingsView() {
  const { state } = useSocket();
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);

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

  const handleToggleLock = async () => {
    const newVal = state.liveLock ? '0' : '1';
    await api.patch('/settings', { live_lock: newVal });
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

      {/* Live lock */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Verrouillage live
        </h3>
        <button
          className={`btn ${state.liveLock ? 'btn-primary' : 'btn-secondary'}`}
          onClick={handleToggleLock}
        >
          {state.liveLock ? 'Déverrouiller' : 'Verrouiller (mode live)'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Le verrouillage bloque les modifications de file, playlists et édition, mais laisse les commandes de transport et l'ajout en file.
        </p>
      </section>

      {/* Library sync */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Synchronisation bibliothèque
        </h3>
        <button className="btn btn-secondary" onClick={handleSyncLibrary}>
          Synchroniser maintenant
        </button>
      </section>

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
