import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';

/**
 * JukeboxView — dedicated Jukebox management screen.
 * Only rendered when the Jukebox plugin is installed (checked by ControlLayout).
 *
 * Contains:
 * - Connection status (server, API key, poll, played)
 * - Catalog sync (manual trigger + result)
 * - Tag visibility management
 */
export default function JukeboxView() {
  const [status, setStatus] = useState(null);
  const [tags, setTags] = useState(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [toggling, setToggling] = useState(false);

  // Fetch status periodically
  useEffect(() => {
    const fetchStatus = () => {
      api.get('/plugins/jukebox/status').then(setStatus).catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // Fetch tags once
  useEffect(() => {
    api.get('/plugins/jukebox/tags').then(setTags).catch(() => {});
  }, []);

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    setSyncResult(null);
    try {
      const res = await api.post('/plugins/jukebox/sync-catalog');
      setSyncResult(res);
    } catch (err) {
      setSyncResult({ ok: false, error: err.message });
    }
    setSyncingCatalog(false);
  };

  const handleToggleTag = async (tagName, currentlyHidden) => {
    const currentTags = tags?.tags || [];
    const newHidden = currentlyHidden
      ? currentTags.filter(t => t.hidden && t.name !== tagName).map(t => t.name)
      : [...currentTags.filter(t => t.hidden).map(t => t.name), tagName];
    await api.patch('/plugins/jukebox/tags', { hidden_tags: newHidden });
    setTags({
      tags: currentTags.map(t => ({
        ...t,
        hidden: newHidden.includes(t.name),
      })),
    });
  };

  const statusRow = (label, value, color) => (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 130, fontSize: 12 }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', fontSize: 12 }}>{value}</span>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 24 }}>Jukebox</h2>

      {/* ── Connection & Status ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          État
        </h3>
        {!status && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
        )}
        {status && (
          <div style={{
            padding: '10px 14px', borderRadius: 6,
            background: 'var(--bg-secondary)',
            display: 'flex', flexDirection: 'column',
          }}>
            {/* Connection toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 130, fontSize: 12 }}>Connexion</span>
              <button
                className={`btn btn-sm ${status.connected ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '2px 12px' }}
                disabled={toggling}
                onClick={async () => {
                  setToggling(true);
                  try {
                    await api.post('/plugins/jukebox/toggle');
                  } catch {}
                  // Refresh status
                  try {
                    const s = await api.get('/plugins/jukebox/status');
                    setStatus(s);
                  } catch {}
                  setToggling(false);
                }}
              >
                {status.connected ? 'Active' : 'Inactive'}
              </button>
            </div>
            {statusRow('Serveur', status.serverUrl || 'Non configuré',
              status.serverUrl ? 'var(--text-primary)' : 'var(--warning)')}
            {statusRow('Clé API', status.apiKeySet ? 'Configurée' : 'Non configurée',
              status.apiKeySet ? 'var(--success)' : 'var(--warning)')}

            {status.poll?.lastPollAt && (
              <>
                {statusRow(
                  'Dernier poll',
                  `${status.poll.lastPollOk ? 'OK' : 'Erreur'} — ${new Date(status.poll.lastPollAt).toLocaleTimeString('fr-FR')}`,
                  status.poll.lastPollOk ? 'var(--success)' : '#ef4444'
                )}
                {status.poll.lastPollError && (
                  <div style={{ color: '#ef4444', fontSize: 11, paddingLeft: 138, marginTop: -2 }}>
                    {status.poll.lastPollError}
                  </div>
                )}
              </>
            )}

            {status.poll?.lastRequestTitle && statusRow(
              'Dernière demande',
              `${status.poll.lastRequestTitle}${status.poll.lastRequestAt ? ` — ${new Date(status.poll.lastRequestAt).toLocaleTimeString('fr-FR')}` : ''}`
            )}

            {status.played?.lastPlayedTitle && statusRow(
              'Dernier played',
              `${status.played.lastPlayedTitle}${status.played.lastPlayedAt ? ` — ${new Date(status.played.lastPlayedAt).toLocaleTimeString('fr-FR')}` : ''}`,
              status.played.lastPlayedOk ? 'var(--success)' : '#ef4444'
            )}

            {statusRow('Demandes traitées', `${status.poll?.totalProcessed || 0}`)}
            {statusRow('Played reportés', `${status.played?.totalReported || 0}`)}
          </div>
        )}
      </section>

      {/* ── Catalog Sync ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
          Synchronisation catalogue
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
          Pousse le catalogue ShowMaster vers le serveur Jukebox.
          Seules les chansons marquées comme visibles sont envoyées.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            disabled={syncingCatalog}
            onClick={handleSyncCatalog}
          >
            {syncingCatalog ? 'Sync en cours...' : 'Synchroniser maintenant'}
          </button>
          {syncResult && (
            <span style={{ fontSize: 12, color: syncResult.ok ? 'var(--success)' : '#ef4444' }}>
              {syncResult.ok
                ? syncResult.unchanged
                  ? 'Catalogue inchangé'
                  : `${syncResult.total || 0} chansons (${syncResult.inserted || 0} new, ${syncResult.updated || 0} maj, ${syncResult.deactivated || 0} désact.)`
                : syncResult.error
              }
            </span>
          )}
        </div>
      </section>

      {/* ── Tags ── */}
      {tags?.tags && tags.tags.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Tags publiés
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Cliquez sur un tag pour le masquer ou le rendre visible dans le Jukebox public.
            Les tags masqués ne sont pas envoyés lors de la synchronisation.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.tags.map(tag => (
              <button
                key={tag.name}
                className={`btn btn-sm ${tag.hidden ? 'btn-secondary' : 'btn-primary'}`}
                style={{
                  fontSize: 11, padding: '3px 10px',
                  opacity: tag.hidden ? 0.5 : 1,
                  textDecoration: tag.hidden ? 'line-through' : 'none',
                }}
                onClick={() => handleToggleTag(tag.name, tag.hidden)}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
