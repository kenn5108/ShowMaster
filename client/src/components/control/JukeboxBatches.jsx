import React, { useEffect, useState } from 'react';
import { api } from '../../utils/api';

const CODE_STATUS_LABELS = {
  active: 'Disponible',
  used: 'Utilisé',
  expired: 'Expiré',
  revoked: 'Révoqué',
};

const CODE_STATUS_COLORS = {
  active: 'var(--success)',
  used: '#3b82f6',
  expired: 'var(--text-muted)',
  revoked: '#ef4444',
};

/**
 * JukeboxBatches — Phase 2 : Gestion des lots de codes
 *
 * Props:
 *   sessions — array of Jukebox sessions (from parent)
 *   connected — boolean, true if Jukebox modules are active
 */
export default function JukeboxBatches({ sessions, connected }) {
  const [batches, setBatches] = useState(null);
  const [batchesError, setBatchesError] = useState(null);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ label: '', size: '' });
  const [creating, setCreating] = useState(false);

  // Activation
  const [activateTarget, setActivateTarget] = useState(null); // batch_number being activated
  const [activateSessionId, setActivateSessionId] = useState('');
  const [activating, setActivating] = useState(false);

  // ── Load batches ──
  const loadBatches = () => {
    setBatchesError(null);
    api.get('/plugins/jukebox/batches')
      .then(data => setBatches(data.batches || data))
      .catch(err => setBatchesError(err.message));
  };

  useEffect(() => { loadBatches(); }, []);

  // ── Expand / load detail ──
  const toggleExpand = async (batchNumber) => {
    if (expandedBatch === batchNumber) {
      setExpandedBatch(null);
      setBatchDetail(null);
      return;
    }
    setExpandedBatch(batchNumber);
    setBatchDetail(null);
    setDetailLoading(true);
    try {
      const data = await api.get(`/plugins/jukebox/batches/${batchNumber}`);
      setBatchDetail(data.batch || data);
    } catch (err) {
      setBatchDetail({ _error: err.message });
    }
    setDetailLoading(false);
  };

  // ── Create batch ──
  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.post('/plugins/jukebox/batches', {
        label: createForm.label,
        size: parseInt(createForm.size, 10),
      });
      setShowCreate(false);
      setCreateForm({ label: '', size: '' });
      loadBatches();
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
    setCreating(false);
  };

  // ── Activate batch ──
  const handleActivate = async (batchNumber) => {
    if (!activateSessionId) return;
    setActivating(true);
    try {
      await api.post('/plugins/jukebox/batches/activate', {
        batch_numbers: [batchNumber],
        session_id: parseInt(activateSessionId, 10),
      });
      setActivateTarget(null);
      setActivateSessionId('');
      loadBatches();
      // Refresh detail if this batch is expanded
      if (expandedBatch === batchNumber) {
        toggleExpand(batchNumber);
        setTimeout(() => toggleExpand(batchNumber), 100);
      }
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
    setActivating(false);
  };

  // ── Deactivate batch ──
  const handleDeactivate = async (batchNumber) => {
    if (!confirm('Désactiver ce lot ? Les codes actifs ne seront plus utilisables.')) return;
    try {
      await api.post('/plugins/jukebox/batches/deactivate', {
        batch_numbers: [batchNumber],
      });
      loadBatches();
      if (expandedBatch === batchNumber) {
        toggleExpand(batchNumber);
        setTimeout(() => toggleExpand(batchNumber), 100);
      }
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  };

  // ── Activable sessions: draft + waiting + open ──
  const activableSessions = (sessions || []).filter(s =>
    s.status === 'draft' || s.status === 'waiting' || s.status === 'open'
  );

  // ── Helper: find session name by id ──
  const sessionName = (sessionId) => {
    if (!sessionId) return null;
    const s = (sessions || []).find(s => s.id == sessionId);
    return s ? s.name : `#${sessionId}`;
  };

  // ── Helper: session status for UX warning ──
  const sessionStatus = (sessionId) => {
    const s = (sessions || []).find(s => s.id == sessionId);
    return s?.status || null;
  };

  // ── Stats from batch summary ──
  const getStat = (batch, key) => {
    if (batch.stats && batch.stats[key] !== undefined) return batch.stats[key];
    if (batch[`${key}_count`] !== undefined) return batch[`${key}_count`];
    if (batch[key] !== undefined) return batch[key];
    return '—';
  };

  // ── Progress bar ──
  const renderProgressBar = (detail) => {
    const stats = {
      active: getStat(detail, 'active'),
      used: getStat(detail, 'used'),
      expired: getStat(detail, 'expired'),
      revoked: getStat(detail, 'revoked'),
    };
    const total = Object.values(stats).reduce((a, b) => (typeof b === 'number' ? a + b : a), 0);
    if (total === 0) return null;

    const segments = ['active', 'used', 'expired', 'revoked']
      .filter(k => typeof stats[k] === 'number' && stats[k] > 0)
      .map(k => ({
        key: k,
        count: stats[k],
        pct: (stats[k] / total * 100),
        color: CODE_STATUS_COLORS[k],
        label: CODE_STATUS_LABELS[k],
      }));

    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 8, marginBottom: 4 }}>
          {segments.map(seg => (
            <div key={seg.key} style={{ width: `${seg.pct}%`, background: seg.color, minWidth: seg.count > 0 ? 2 : 0 }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {segments.map(seg => (
            <span key={seg.key} style={{ fontSize: 11, color: seg.color }}>
              {seg.label} : {seg.count}
            </span>
          ))}
        </div>
      </div>
    );
  };

  // ── Render ──
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Lots de codes</h3>
        <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
          onClick={() => { setShowCreate(true); setCreateForm({ label: '', size: '' }); }}>
          + Nouveau lot
        </button>
        <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={loadBatches}>
          Rafraîchir
        </button>
      </div>

      {/* ── Create form ── */}
      {showCreate && (
        <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Nouveau lot</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Label du lot" value={createForm.label}
              onChange={e => setCreateForm(f => ({ ...f, label: e.target.value }))}
              style={{ fontSize: 13 }} />
            <input type="number" placeholder="Nombre de codes" min="1" value={createForm.size}
              onChange={e => setCreateForm(f => ({ ...f, size: e.target.value }))}
              style={{ fontSize: 13, width: 180 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm btn-primary"
                disabled={creating || !createForm.label || !createForm.size || parseInt(createForm.size, 10) < 1}
                onClick={handleCreate}>
                {creating ? 'Création...' : 'Créer'}
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowCreate(false)}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {batchesError && (
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{batchesError}</div>
      )}

      {/* ── Loading ── */}
      {batches === null && !batchesError && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
      )}

      {/* ── Empty state ── */}
      {batches && batches.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun lot créé</div>
      )}

      {/* ── Batch list ── */}
      {batches && batches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {/* Header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '60px 1fr 60px 130px 70px 60px 60px 60px',
            gap: 4,
            padding: '4px 12px',
            fontSize: 10,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
          }}>
            <span>N°</span>
            <span>Label</span>
            <span>Taille</span>
            <span>Session</span>
            <span style={{ color: CODE_STATUS_COLORS.active }}>Dispo.</span>
            <span style={{ color: CODE_STATUS_COLORS.used }}>Util.</span>
            <span style={{ color: CODE_STATUS_COLORS.expired }}>Exp.</span>
            <span style={{ color: CODE_STATUS_COLORS.revoked }}>Rév.</span>
          </div>

          {/* Data rows */}
          {[...batches].sort((a, b) => (b.batch_number || 0) - (a.batch_number || 0)).map(batch => (
            <React.Fragment key={batch.batch_number}>
              <div
                onClick={() => toggleExpand(batch.batch_number)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 60px 130px 70px 60px 60px 60px',
                  gap: 4,
                  padding: '8px 12px',
                  borderRadius: 6,
                  background: expandedBatch === batch.batch_number ? 'rgba(59,130,246,0.08)' : 'var(--bg-secondary)',
                  border: expandedBatch === batch.batch_number ? '1px solid rgba(59,130,246,0.3)' : '1px solid transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                  #{String(batch.batch_number).padStart(3, '0')}
                </span>
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {batch.label || '—'}
                </span>
                <span>{batch.size || getStat(batch, 'total') || '—'}</span>
                <span>
                  {batch.session_id ? (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
                    }}>
                      {sessionName(batch.session_id)}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                  )}
                </span>
                <span style={{ color: CODE_STATUS_COLORS.active }}>{getStat(batch, 'active')}</span>
                <span style={{ color: CODE_STATUS_COLORS.used }}>{getStat(batch, 'used')}</span>
                <span style={{ color: CODE_STATUS_COLORS.expired }}>{getStat(batch, 'expired')}</span>
                <span style={{ color: CODE_STATUS_COLORS.revoked }}>{getStat(batch, 'revoked')}</span>
              </div>

              {/* ── Expanded detail ── */}
              {expandedBatch === batch.batch_number && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '0 0 6px 6px',
                  background: 'var(--bg-secondary)',
                  borderLeft: '3px solid rgba(59,130,246,0.4)',
                  marginTop: -2,
                }}>
                  {detailLoading && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement du détail...</div>
                  )}
                  {batchDetail?._error && (
                    <div style={{ fontSize: 12, color: '#ef4444' }}>{batchDetail._error}</div>
                  )}
                  {batchDetail && !batchDetail._error && !detailLoading && (
                    <>
                      {/* Progress bar */}
                      {renderProgressBar(batchDetail)}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                        {/* Activate — shown when batch has no session */}
                        {!batch.session_id && activateTarget !== batch.batch_number && (
                          <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                            onClick={(e) => { e.stopPropagation(); setActivateTarget(batch.batch_number); setActivateSessionId(''); }}>
                            Activer sur une session
                          </button>
                        )}

                        {/* Activate: session picker */}
                        {activateTarget === batch.batch_number && (
                          <>
                            <select
                              value={activateSessionId}
                              onChange={e => setActivateSessionId(e.target.value)}
                              style={{ fontSize: 12, padding: '3px 6px', borderRadius: 4 }}
                              onClick={e => e.stopPropagation()}
                            >
                              <option value="">Choisir une session...</option>
                              {activableSessions.map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.status === 'open' ? '⚡ en cours' : s.status})
                                </option>
                              ))}
                            </select>
                            {activateSessionId && sessionStatus(activateSessionId) === 'open' ? (
                              <button className="btn btn-sm" style={{ fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none' }}
                                disabled={activating}
                                onClick={(e) => { e.stopPropagation(); handleActivate(batch.batch_number); }}>
                                {activating ? '...' : 'Activer sur session en cours'}
                              </button>
                            ) : (
                              <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                                disabled={activating || !activateSessionId}
                                onClick={(e) => { e.stopPropagation(); handleActivate(batch.batch_number); }}>
                                {activating ? '...' : 'Activer'}
                              </button>
                            )}
                            <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
                              onClick={(e) => { e.stopPropagation(); setActivateTarget(null); }}>
                              Annuler
                            </button>
                          </>
                        )}

                        {/* Deactivate — shown when batch has a session */}
                        {batch.session_id && (
                          <button className="btn btn-sm btn-secondary" style={{ fontSize: 11, color: '#ef4444' }}
                            onClick={(e) => { e.stopPropagation(); handleDeactivate(batch.batch_number); }}>
                            Désactiver
                          </button>
                        )}
                      </div>

                      {/* Code list */}
                      {batchDetail.codes && batchDetail.codes.length > 0 && (
                        <div style={{ maxHeight: 240, overflowY: 'auto', borderRadius: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'var(--text-muted)' }}>Code</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'var(--text-muted)' }}>Statut</th>
                                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: 'var(--text-muted)' }}>Utilisé le</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchDetail.codes.map((code, idx) => (
                                <tr key={code.code || idx} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                  <td style={{ padding: '3px 8px', fontFamily: 'monospace', fontSize: 11 }}>
                                    {code.code}
                                  </td>
                                  <td style={{ padding: '3px 8px' }}>
                                    <span style={{ color: CODE_STATUS_COLORS[code.status] || 'var(--text-muted)' }}>
                                      {CODE_STATUS_LABELS[code.status] || code.status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '3px 8px', color: 'var(--text-muted)' }}>
                                    {code.used_at ? new Date(code.used_at).toLocaleString('fr-FR', {
                                      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                    }) : '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* No codes fallback */}
                      {(!batchDetail.codes || batchDetail.codes.length === 0) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Aucun code dans ce lot</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
