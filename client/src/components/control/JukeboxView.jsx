import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import JukeboxBatches from './JukeboxBatches';

const STATUS_LABELS = {
  draft: 'Brouillon',
  waiting: 'En attente',
  open: 'Ouverte',
  full: 'Complète',
  closed: 'Fermée',
};

const STATUS_COLORS = {
  draft: 'var(--text-muted)',
  waiting: '#f59e0b',
  open: 'var(--success)',
  full: '#3b82f6',
  closed: '#ef4444',
};

// What the public sees for the current session
const PUBLIC_DESCRIPTION = {
  draft: 'Non visible publiquement',
  waiting: 'Visible publiquement — en attente d\u2019ouverture',
  open: 'Ouverte aux demandes du public',
  full: 'Visible publiquement — plus de demandes acceptées',
  closed: 'Fermée',
};

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Status badge component
function StatusBadge({ status }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
      background: `${STATUS_COLORS[status] || 'var(--text-muted)'}22`,
      color: STATUS_COLORS[status] || 'var(--text-muted)',
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function JukeboxView() {
  const [status, setStatus] = useState(null);
  const [tags, setTags] = useState(null);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [toggling, setToggling] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState(null);
  const [sessionsError, setSessionsError] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [editingSession, setEditingSession] = useState(null);
  const [sessionForm, setSessionForm] = useState({ name: '', date_event: '', opens_at: '', closes_at: '' });
  const [sessionSaving, setSessionSaving] = useState(false);

  // Batches (loaded here so activation rapide + badges can use them)
  const [batches, setBatches] = useState(null);

  // Quick activate
  const [activateMode, setActivateMode] = useState('numbers');
  const [activateNumbers, setActivateNumbers] = useState('');
  const [activateFrom, setActivateFrom] = useState('');
  const [activateTo, setActivateTo] = useState('');
  const [quickActivating, setQuickActivating] = useState(false);
  const [quickActivateResult, setQuickActivateResult] = useState(null);

  // ── Fetch status periodically ──
  useEffect(() => {
    const fetchStatus = () => {
      api.get('/plugins/jukebox/status').then(setStatus).catch(() => {});
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch tags once ──
  useEffect(() => {
    api.get('/plugins/jukebox/tags').then(setTags).catch(() => {});
  }, []);

  // ── Fetch sessions ──
  const loadSessions = () => {
    setSessionsError(null);
    api.get('/plugins/jukebox/sessions')
      .then(data => setSessions(data.sessions || data))
      .catch(err => setSessionsError(err.message));
  };
  useEffect(() => { loadSessions(); }, []);

  // ── Fetch batches ──
  const loadBatches = () => {
    api.get('/plugins/jukebox/batches')
      .then(data => setBatches(data.batches || data))
      .catch(() => {});
  };
  useEffect(() => { loadBatches(); }, []);

  // ── Quick activate helpers ──
  const parseNumbers = (input) => {
    return input.split(/[\s,;]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
  };

  const expandRange = (from, to) => {
    const f = parseInt(from, 10);
    const t = parseInt(to, 10);
    if (isNaN(f) || isNaN(t) || f < 1 || t < f) return [];
    const nums = [];
    for (let i = f; i <= t; i++) nums.push(i);
    return nums;
  };

  // ── Session actions ──
  const changeStatus = async (id, newStatus) => {
    try {
      await api.put(`/plugins/jukebox/sessions/${id}/status`, { status: newStatus });
      loadSessions();
    } catch (err) { alert(`Erreur : ${err.message}`); }
  };

  const setCurrent = async (id) => {
    try {
      await api.put(`/plugins/jukebox/sessions/${id}/current`, {});
      loadSessions();
    } catch (err) { alert(`Erreur : ${err.message}`); }
  };

  const saveSession = async () => {
    setSessionSaving(true);
    try {
      if (editingSession) {
        await api.put(`/plugins/jukebox/sessions/${editingSession}`, sessionForm);
      } else {
        await api.post('/plugins/jukebox/sessions', sessionForm);
      }
      setShowNewSession(false);
      setEditingSession(null);
      setSessionForm({ name: '', date_event: '', opens_at: '', closes_at: '' });
      loadSessions();
    } catch (err) { alert(`Erreur : ${err.message}`); }
    setSessionSaving(false);
  };

  const startEdit = (s) => {
    setEditingSession(s.id);
    setSessionForm({
      name: s.name || '',
      date_event: s.date_event ? s.date_event.slice(0, 10) : '',
      opens_at: s.opens_at ? s.opens_at.slice(0, 16) : '',
      closes_at: s.closes_at ? s.closes_at.slice(0, 16) : '',
    });
    setShowNewSession(true);
  };

  // ── Helpers ──
  const statusRow = (label, value, color) => (
    <div style={{ display: 'flex', gap: 8, padding: '4px 0' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 130, fontSize: 12 }}>{label}</span>
      <span style={{ color: color || 'var(--text-primary)', fontSize: 12 }}>{value}</span>
    </div>
  );

  // Transitions: label shown depends on context
  const getTransitions = (s) => {
    switch (s.status) {
      case 'draft':
        return [{ label: 'Publier', to: 'waiting' }];
      case 'waiting':
        return [{ label: 'Ouvrir les demandes', to: 'open' }];
      case 'open':
        return [
          { label: 'Passer en complète', to: 'full' },
          { label: 'Fermer', to: 'closed', secondary: true },
        ];
      case 'full':
        return [
          { label: 'Rouvrir', to: 'open' },
          { label: 'Fermer', to: 'closed', secondary: true },
        ];
      default:
        return [];
    }
  };

  const currentSession = sessions?.find(s => s.is_current == 1);

  // Group non-current sessions (closed sessions are purged server-side, not shown here)
  const drafts = sessions?.filter(s => s.is_current != 1 && s.status === 'draft') || [];
  const upcoming = sessions?.filter(s => s.is_current != 1 && s.status === 'waiting') || [];
  const otherActive = sessions?.filter(s => s.is_current != 1 && (s.status === 'open' || s.status === 'full')) || [];

  // Helper: render a session row (inline, not a component — avoids remount on re-render)
  const renderSessionRow = (s, showSetCurrent) => (
    <div key={s.id} style={{
      padding: '8px 12px', borderRadius: 6,
      background: s.is_current == 1 ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
      border: s.is_current == 1 ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
          {s.name}
          {s.is_current == 1 && <span style={{ fontSize: 10, color: '#3b82f6', fontWeight: 700, marginLeft: 6 }}>COURANTE</span>}
        </span>
        <StatusBadge status={s.status} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(s.date_event)}</span>
      </div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {showSetCurrent && s.status !== 'closed' && (
          <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '1px 8px' }}
            onClick={() => setCurrent(s.id)}>
            Définir courante
          </button>
        )}
        {getTransitions(s).map(t => (
          <button key={t.to}
            className={`btn btn-sm ${t.secondary ? 'btn-secondary' : 'btn-primary'}`}
            style={{ fontSize: 10, padding: '1px 8px' }}
            onClick={() => changeStatus(s.id, t.to)}>
            {t.label}
          </button>
        ))}
        {s.status !== 'closed' && (
          <button className="btn btn-sm btn-secondary" style={{ fontSize: 10, padding: '1px 8px' }}
            onClick={() => startEdit(s)}>
            Modifier
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 24 }}>Jukebox</h2>

      {/* ── Connection & Status ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>État</h3>
        {!status ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
        ) : (
          <div style={{ padding: '10px 14px', borderRadius: 6, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)', minWidth: 130, fontSize: 12 }}>Connexion</span>
              <button
                className={`btn btn-sm ${status.connected ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: 11, padding: '2px 12px' }}
                disabled={toggling}
                onClick={async () => {
                  setToggling(true);
                  try { await api.post('/plugins/jukebox/toggle'); } catch {}
                  try { setStatus(await api.get('/plugins/jukebox/status')); } catch {}
                  setToggling(false);
                }}
              >
                {status.connected ? 'Active' : 'Inactive'}
              </button>
            </div>
            {statusRow('Serveur', status.serverUrl || 'Non configuré', status.serverUrl ? 'var(--text-primary)' : 'var(--warning)')}
            {statusRow('Clé API', status.apiKeySet ? 'Configurée' : 'Non configurée', status.apiKeySet ? 'var(--success)' : 'var(--warning)')}
            {status.poll?.lastPollAt && statusRow('Dernier poll',
              `${status.poll.lastPollOk ? 'OK' : 'Erreur'} — ${new Date(status.poll.lastPollAt).toLocaleTimeString('fr-FR')}`,
              status.poll.lastPollOk ? 'var(--success)' : '#ef4444'
            )}
            {statusRow('Demandes', `${status.poll?.totalProcessed || 0} traitées`)}
            {statusRow('Played', `${status.played?.totalReported || 0} reportés`)}
          </div>
        )}
      </section>

      {/* ── Session courante ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Session courante</h3>
        {sessions === null && !sessionsError && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
        )}
        {sessionsError && (
          <div style={{ fontSize: 12, color: '#ef4444' }}>{sessionsError}</div>
        )}
        {sessions && !currentSession && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune session courante définie</div>
        )}
        {currentSession && (
          <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>{currentSession.name}</span>
              <StatusBadge status={currentSession.status} />
            </div>
            {/* Public visibility description */}
            <div style={{
              fontSize: 11, padding: '4px 8px', borderRadius: 4, marginBottom: 8,
              background: currentSession.status === 'draft' ? 'rgba(255,255,255,0.03)' : 'rgba(59,130,246,0.06)',
              color: currentSession.status === 'draft' ? 'var(--text-muted)' : '#60a5fa',
            }}>
              {PUBLIC_DESCRIPTION[currentSession.status] || ''}
              {currentSession.status === 'waiting' && currentSession.opens_at && (
                <span style={{ marginLeft: 6 }}>
                  Ouverture prévue : {formatTime(currentSession.opens_at)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              {formatDate(currentSession.date_event)}
              {currentSession.opens_at && ` · Ouverture ${formatTime(currentSession.opens_at)}`}
              {currentSession.closes_at && ` · Fermeture ${formatTime(currentSession.closes_at)}`}
            </div>
            {/* ── Résumé opérationnel codes ── */}
            {(() => {
              const sessionBatches = (batches || []).filter(b => b.session_id && b.session_id == currentSession.id);
              if (sessionBatches.length === 0) return null;
              const gs = (b, k) => {
                if (b.stats && b.stats[k] !== undefined) return b.stats[k];
                if (b[`${k}_count`] !== undefined) return b[`${k}_count`];
                if (b[k] !== undefined) return b[k];
                return 0;
              };
              const t = { active: 0, used: 0, expired: 0, revoked: 0 };
              sessionBatches.forEach(b => {
                t.active += (typeof gs(b, 'active') === 'number' ? gs(b, 'active') : 0);
                t.used += (typeof gs(b, 'used') === 'number' ? gs(b, 'used') : 0);
                t.expired += (typeof gs(b, 'expired') === 'number' ? gs(b, 'expired') : 0);
                t.revoked += (typeof gs(b, 'revoked') === 'number' ? gs(b, 'revoked') : 0);
              });
              const total = t.active + t.used + t.expired + t.revoked;
              if (total === 0) return null;
              const consumed = t.used;
              const remaining = t.active;
              // Secondary info: expired/revoked shown only if > 0
              const secondary = [
                t.expired > 0 && { count: t.expired, label: 'expiré' + (t.expired > 1 ? 's' : ''), color: 'var(--text-muted)' },
                t.revoked > 0 && { count: t.revoked, label: 'révoqué' + (t.revoked > 1 ? 's' : ''), color: '#ef4444' },
              ].filter(Boolean);
              // Progress bar: consumed (blue) + remaining (green) + expired (muted) + revoked (red)
              const barSegments = [
                { key: 'used', count: consumed, color: '#3b82f6' },
                { key: 'active', count: remaining, color: 'var(--success)' },
                t.expired > 0 && { key: 'expired', count: t.expired, color: 'var(--text-muted)' },
                t.revoked > 0 && { key: 'revoked', count: t.revoked, color: '#ef4444' },
              ].filter(Boolean);
              return (
                <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{total} codes attribués</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span style={{ color: '#3b82f6', fontWeight: 500 }}>{consumed} consommé{consumed > 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span style={{ color: 'var(--success)', fontWeight: 500 }}>{remaining} restant{remaining > 1 ? 's' : ''}</span>
                    {secondary.map(s => (
                      <React.Fragment key={s.label}>
                        <span style={{ color: 'var(--text-muted)' }}>·</span>
                        <span style={{ color: s.color, fontSize: 11 }}>{s.count} {s.label}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 6 }}>
                    {barSegments.map(s => (
                      <div key={s.key} style={{
                        width: `${(s.count / total * 100)}%`,
                        background: s.color,
                        minWidth: s.count > 0 ? 2 : 0,
                      }} />
                    ))}
                  </div>
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {getTransitions(currentSession).map(t => (
                <button key={t.to}
                  className={`btn btn-sm ${t.secondary ? 'btn-secondary' : 'btn-primary'}`}
                  style={{ fontSize: 11 }}
                  onClick={() => changeStatus(currentSession.id, t.to)}>
                  {t.label}
                </button>
              ))}
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => startEdit(currentSession)}>
                Modifier
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Activation rapide + Lots activés ── */}
      {(() => {
        const canActivate = !!currentSession && currentSession.status !== 'full' && currentSession.status !== 'closed';
        const isSessionOpen = currentSession?.status === 'open';
        const activatedBatches = (batches || []).filter(b => b.session_id && currentSession && b.session_id == currentSession.id)
          .sort((a, b) => (a.batch_number || 0) - (b.batch_number || 0));
        const quickActivateValid = activateMode === 'numbers'
          ? parseNumbers(activateNumbers).length > 0
          : expandRange(activateFrom, activateTo).length > 0;

        const handleQuickActivate = async () => {
          const nums = activateMode === 'numbers'
            ? parseNumbers(activateNumbers)
            : expandRange(activateFrom, activateTo);
          if (nums.length === 0) return;
          setQuickActivating(true);
          setQuickActivateResult(null);
          try {
            await api.post('/plugins/jukebox/batches/activate', {
              batch_numbers: nums,
              session_id: currentSession.id,
            });
            setQuickActivateResult({ ok: true, count: nums.length });
            setActivateNumbers('');
            setActivateFrom('');
            setActivateTo('');
            loadBatches();
          } catch (err) {
            setQuickActivateResult({ ok: false, error: err.message });
          }
          setQuickActivating(false);
        };

        return (
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Activation rapide</h3>
            <div style={{
              padding: '12px 14px', borderRadius: 6,
              background: 'var(--bg-secondary)',
              opacity: canActivate ? 1 : 0.6,
            }}>
              {/* Session target */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {currentSession ? (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: isSessionOpen ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)',
                    color: isSessionOpen ? '#f59e0b' : '#60a5fa',
                  }}>
                    {currentSession.name} ({isSessionOpen ? 'en cours' : STATUS_LABELS[currentSession.status] || currentSession.status})
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Aucune session courante</span>
                )}
              </div>

              {/* Activated batches badges */}
              {activatedBatches.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lots activés :</span>
                  {activatedBatches.map(b => (
                    <span key={b.batch_number} style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(34,197,94,0.12)', color: 'var(--success)',
                      fontFamily: 'monospace',
                    }}>
                      #{String(b.batch_number).padStart(3, '0')}
                    </span>
                  ))}
                </div>
              )}

              {!canActivate ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {!currentSession
                    ? 'Définissez une session courante pour activer des lots.'
                    : `La session courante ne peut pas recevoir de lots (statut : ${STATUS_LABELS[currentSession.status] || currentSession.status}).`}
                </div>
              ) : (
                <>
                  {/* Mode toggle */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    <button className={`btn btn-sm ${activateMode === 'numbers' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      onClick={() => setActivateMode('numbers')}>
                      Par numéros
                    </button>
                    <button className={`btn btn-sm ${activateMode === 'range' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ fontSize: 10, padding: '2px 8px' }}
                      onClick={() => setActivateMode('range')}>
                      Par plage
                    </button>
                  </div>

                  {activateMode === 'numbers' ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input placeholder="Ex: 12, 15, 18" value={activateNumbers}
                        onChange={e => { setActivateNumbers(e.target.value); setQuickActivateResult(null); }}
                        style={{ fontSize: 13, flex: 1 }} />
                      <button className={`btn btn-sm ${isSessionOpen ? '' : 'btn-primary'}`}
                        style={isSessionOpen ? { fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none', whiteSpace: 'nowrap' } : { fontSize: 11, whiteSpace: 'nowrap' }}
                        disabled={quickActivating || !quickActivateValid}
                        onClick={handleQuickActivate}>
                        {quickActivating ? '...' : (isSessionOpen ? 'Activer sur session en cours' : 'Activer')}
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>De</span>
                      <input type="number" min="1" value={activateFrom}
                        onChange={e => { setActivateFrom(e.target.value); setQuickActivateResult(null); }}
                        style={{ fontSize: 13, width: 70 }} />
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>à</span>
                      <input type="number" min="1" value={activateTo}
                        onChange={e => { setActivateTo(e.target.value); setQuickActivateResult(null); }}
                        style={{ fontSize: 13, width: 70 }} />
                      <button className={`btn btn-sm ${isSessionOpen ? '' : 'btn-primary'}`}
                        style={isSessionOpen ? { fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none', whiteSpace: 'nowrap' } : { fontSize: 11, whiteSpace: 'nowrap' }}
                        disabled={quickActivating || !quickActivateValid}
                        onClick={handleQuickActivate}>
                        {quickActivating ? '...' : (isSessionOpen ? 'Activer sur session en cours' : 'Activer')}
                      </button>
                    </div>
                  )}

                  {quickActivateResult && (
                    <div style={{ fontSize: 12, marginTop: 6, color: quickActivateResult.ok ? 'var(--success)' : '#ef4444' }}>
                      {quickActivateResult.ok
                        ? `✓ ${quickActivateResult.count} lot${quickActivateResult.count > 1 ? 's' : ''} activé${quickActivateResult.count > 1 ? 's' : ''} sur ${currentSession.name}`
                        : quickActivateResult.error}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })()}

      {/* ── Sessions ── */}
      <section style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Sessions</h3>
          <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={() => {
            setEditingSession(null);
            setSessionForm({ name: '', date_event: '', opens_at: '', closes_at: '' });
            setShowNewSession(true);
          }}>
            + Nouvelle
          </button>
          <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={loadSessions}>
            Rafraîchir
          </button>
        </div>

        {showNewSession && (
          <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              {editingSession ? 'Modifier la session' : 'Nouvelle session'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input placeholder="Nom de la session" value={sessionForm.name}
                onChange={e => setSessionForm(f => ({ ...f, name: e.target.value }))} style={{ fontSize: 13 }} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 140 }}>
                  Date événement
                  <input type="date" value={sessionForm.date_event}
                    onChange={e => setSessionForm(f => ({ ...f, date_event: e.target.value }))}
                    style={{ width: '100%', fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 140 }}>
                  Ouverture des demandes
                  <input type="datetime-local" value={sessionForm.opens_at}
                    onChange={e => setSessionForm(f => ({ ...f, opens_at: e.target.value }))}
                    style={{ width: '100%', fontSize: 13 }} />
                </label>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 140 }}>
                  Fermeture des demandes
                  <input type="datetime-local" value={sessionForm.closes_at}
                    onChange={e => setSessionForm(f => ({ ...f, closes_at: e.target.value }))}
                    style={{ width: '100%', fontSize: 13 }} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm btn-primary" disabled={sessionSaving || !sessionForm.name} onClick={saveSession}>
                  {sessionSaving ? 'Enregistrement...' : (editingSession ? 'Mettre à jour' : 'Créer')}
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => { setShowNewSession(false); setEditingSession(null); }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sessions à venir (waiting, non-courantes) — visibles publiquement */}
        {upcoming.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginBottom: 6 }}>
              Sessions à venir (visibles publiquement)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {upcoming.sort((a, b) => (a.date_event || '').localeCompare(b.date_event || '')).map(s => (
                renderSessionRow(s, true)
              ))}
            </div>
          </div>
        )}

        {/* Autres sessions actives (open/full non-courantes — cas rare) */}
        {otherActive.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 6 }}>
              Sessions actives
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {otherActive.map(s => (
                renderSessionRow(s, true)
              ))}
            </div>
          </div>
        )}

        {/* Brouillons (draft) — privés */}
        {drafts.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>
              Brouillons (privés)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {drafts.sort((a, b) => (b.date_event || '').localeCompare(a.date_event || '')).map(s => (
                renderSessionRow(s, true)
              ))}
            </div>
          </div>
        )}

        {sessions && drafts.length === 0 && upcoming.length === 0 && otherActive.length === 0 && !currentSession && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucune session active</div>
        )}
      </section>

      {/* ── Lots de codes ── */}
      <JukeboxBatches sessions={sessions} connected={status?.connected}
        batches={batches} loadBatches={loadBatches} />

      {/* ── Catalog Sync ── */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Synchronisation catalogue</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" disabled={syncingCatalog} onClick={async () => {
            setSyncingCatalog(true); setSyncResult(null);
            try { setSyncResult(await api.post('/plugins/jukebox/sync-catalog')); }
            catch (err) { setSyncResult({ ok: false, error: err.message }); }
            setSyncingCatalog(false);
          }}>
            {syncingCatalog ? 'Sync en cours...' : 'Synchroniser maintenant'}
          </button>
          {syncResult && (
            <span style={{ fontSize: 12, color: syncResult.ok ? 'var(--success)' : '#ef4444' }}>
              {syncResult.ok
                ? syncResult.unchanged ? 'Inchangé' : `${syncResult.total || 0} chansons (${syncResult.inserted || 0} new, ${syncResult.updated || 0} maj, ${syncResult.deactivated || 0} désact.)`
                : syncResult.error}
            </span>
          )}
        </div>
      </section>

      {/* ── Tags ── */}
      {tags?.tags && tags.tags.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Tags publiés</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Tags masqués = non envoyés au Jukebox public lors de la synchronisation.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tags.tags.map(tag => (
              <button key={tag.name}
                className={`btn btn-sm ${tag.hidden ? 'btn-secondary' : 'btn-primary'}`}
                style={{ fontSize: 11, padding: '3px 10px', opacity: tag.hidden ? 0.5 : 1, textDecoration: tag.hidden ? 'line-through' : 'none' }}
                onClick={async () => {
                  const current = tags.tags;
                  const newHidden = tag.hidden
                    ? current.filter(t => t.hidden && t.name !== tag.name).map(t => t.name)
                    : [...current.filter(t => t.hidden).map(t => t.name), tag.name];
                  await api.patch('/plugins/jukebox/tags', { hidden_tags: newHidden });
                  setTags({ tags: current.map(t => ({ ...t, hidden: newHidden.includes(t.name) })) });
                }}
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
