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
 * JukeboxBatches — Phase 2 : Workflow terrain lots de codes
 *
 * Props:
 *   sessions — array of Jukebox sessions (from parent)
 *   connected — boolean, true if Jukebox modules are active
 */
export default function JukeboxBatches({ sessions, connected }) {
  // ── Batch list state ──
  const [batches, setBatches] = useState(null);
  const [batchesError, setBatchesError] = useState(null);
  const [expandedBatch, setExpandedBatch] = useState(null);
  const [batchDetail, setBatchDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Bulk generate state ──
  const [bulkForm, setBulkForm] = useState({ label: '', batch_count: '', size: '' });
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  // ── Quick activate state ──
  const [activateMode, setActivateMode] = useState('numbers'); // 'numbers' | 'range'
  const [activateNumbers, setActivateNumbers] = useState('');
  const [activateFrom, setActivateFrom] = useState('');
  const [activateTo, setActivateTo] = useState('');
  const [quickActivating, setQuickActivating] = useState(false);
  const [quickActivateResult, setQuickActivateResult] = useState(null);

  // ── Per-batch activate in detail view ──
  const [activateTarget, setActivateTarget] = useState(null);
  const [activating, setActivating] = useState(false);

  // ── Derived: current session ──
  const currentSession = (sessions || []).find(s => s.is_current == 1);
  const canActivate = !!currentSession && currentSession.status !== 'full' && currentSession.status !== 'closed';
  const isSessionOpen = currentSession?.status === 'open';

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

  // ── Bulk generate ──
  const handleBulkGenerate = async () => {
    setBulkGenerating(true);
    setBulkResult(null);
    try {
      const result = await api.post('/plugins/jukebox/batches/bulk', {
        label: bulkForm.label,
        batch_count: parseInt(bulkForm.batch_count, 10),
        size: parseInt(bulkForm.size, 10),
      });
      setBulkResult({ ok: true, data: result });
      setBulkForm({ label: '', batch_count: '', size: '' });
      loadBatches();
    } catch (err) {
      setBulkResult({ ok: false, error: err.message });
    }
    setBulkGenerating(false);
  };

  // ── Quick activate ──
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

  const handleQuickActivate = async () => {
    const nums = activateMode === 'numbers'
      ? parseNumbers(activateNumbers)
      : expandRange(activateFrom, activateTo);

    if (nums.length === 0) return;

    setQuickActivating(true);
    setQuickActivateResult(null);
    try {
      const result = await api.post('/plugins/jukebox/batches/activate', {
        batch_numbers: nums,
        session_id: currentSession.id,
      });
      setQuickActivateResult({ ok: true, count: nums.length, data: result });
      setActivateNumbers('');
      setActivateFrom('');
      setActivateTo('');
      loadBatches();
    } catch (err) {
      setQuickActivateResult({ ok: false, error: err.message });
    }
    setQuickActivating(false);
  };

  // ── Per-batch activate (detail view, on current session) ──
  const handleActivateSingle = async (batchNumber) => {
    if (!currentSession) return;
    setActivating(true);
    try {
      await api.post('/plugins/jukebox/batches/activate', {
        batch_numbers: [batchNumber],
        session_id: currentSession.id,
      });
      setActivateTarget(null);
      loadBatches();
      if (expandedBatch === batchNumber) {
        setExpandedBatch(null);
        setBatchDetail(null);
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
        setExpandedBatch(null);
        setBatchDetail(null);
        setTimeout(() => toggleExpand(batchNumber), 100);
      }
    } catch (err) {
      alert(`Erreur : ${err.message}`);
    }
  };

  // ── Helpers ──
  const sessionName = (sessionId) => {
    if (!sessionId) return null;
    const s = (sessions || []).find(s => s.id == sessionId);
    return s ? s.name : `#${sessionId}`;
  };

  const getStat = (batch, key) => {
    if (batch.stats && batch.stats[key] !== undefined) return batch.stats[key];
    if (batch[`${key}_count`] !== undefined) return batch[`${key}_count`];
    if (batch[key] !== undefined) return batch[key];
    return '—';
  };

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

  // Format bulk result summary
  const formatBulkResult = (result) => {
    if (!result?.data) return 'Lots créés';
    const d = result.data;
    if (d.batches && Array.isArray(d.batches) && d.batches.length > 0) {
      const nums = d.batches.map(b => b.batch_number).sort((a, b) => a - b);
      const first = nums[0];
      const last = nums[nums.length - 1];
      const size = d.batches[0]?.size || '?';
      return `${nums.length} lot${nums.length > 1 ? 's' : ''} créé${nums.length > 1 ? 's' : ''} (#${String(first).padStart(3, '0')} → #${String(last).padStart(3, '0')}), ${size} codes/lot`;
    }
    if (d.batch_count) return `${d.batch_count} lots créés`;
    return 'Lots créés';
  };

  // Validate quick activate inputs
  const quickActivateValid = activateMode === 'numbers'
    ? parseNumbers(activateNumbers).length > 0
    : expandRange(activateFrom, activateTo).length > 0;

  // ── Render ──
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Lots de codes</h3>
        <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }} onClick={loadBatches}>
          Rafraîchir
        </button>
      </div>

      {/* ══════════════════════════════════════════════════
          PANNEAU 1 — Génération en masse
          ══════════════════════════════════════════════════ */}
      <div style={{ padding: '12px 14px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Génération en masse</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 140 }}>
            Label
            <input placeholder="Ex: Soirée Rock" value={bulkForm.label}
              onChange={e => setBulkForm(f => ({ ...f, label: e.target.value }))}
              style={{ width: '100%', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 80 }}>
            Nombre de lots
            <input type="number" min="1" value={bulkForm.batch_count}
              onChange={e => setBulkForm(f => ({ ...f, batch_count: e.target.value }))}
              style={{ width: '100%', fontSize: 13 }} />
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 80 }}>
            Codes par lot
            <input type="number" min="1" value={bulkForm.size}
              onChange={e => setBulkForm(f => ({ ...f, size: e.target.value }))}
              style={{ width: '100%', fontSize: 13 }} />
          </label>
          <button className="btn btn-sm btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
            disabled={bulkGenerating || !bulkForm.label || !bulkForm.batch_count || !bulkForm.size
              || parseInt(bulkForm.batch_count, 10) < 1 || parseInt(bulkForm.size, 10) < 1}
            onClick={handleBulkGenerate}>
            {bulkGenerating ? 'Génération...' : 'Générer'}
          </button>
        </div>
        {bulkResult && (
          <div style={{ fontSize: 12, marginTop: 6, color: bulkResult.ok ? 'var(--success)' : '#ef4444' }}>
            {bulkResult.ok ? `✓ ${formatBulkResult(bulkResult)}` : bulkResult.error}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          PANNEAU 2 — Export CSV
          ══════════════════════════════════════════════════ */}
      <div style={{ padding: '10px 14px', borderRadius: 6, background: 'var(--bg-secondary)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Export CSV</span>
        <a href="/api/plugins/jukebox/batches/export" download
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 4, textDecoration: 'none',
            background: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 500,
          }}>
          Télécharger
        </a>
      </div>

      {/* ══════════════════════════════════════════════════
          PANNEAU 3 — Activation rapide sur session courante
          ══════════════════════════════════════════════════ */}
      <div style={{
        padding: '12px 14px', borderRadius: 6, marginBottom: 10,
        background: canActivate ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
        opacity: canActivate ? 1 : 0.6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Activation rapide</span>
          {currentSession ? (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
              background: isSessionOpen ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.1)',
              color: isSessionOpen ? '#f59e0b' : '#60a5fa',
            }}>
              {currentSession.name} ({isSessionOpen ? 'en cours' : currentSession.status})
            </span>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Aucune session courante</span>
          )}
        </div>

        {!canActivate ? (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {!currentSession
              ? 'Définissez une session courante pour activer des lots.'
              : 'La session courante ne peut pas recevoir de lots (statut : ' + currentSession.status + ').'}
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
                {isSessionOpen ? (
                  <button className="btn btn-sm" style={{ fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
                    disabled={quickActivating || !quickActivateValid}
                    onClick={handleQuickActivate}>
                    {quickActivating ? '...' : 'Activer sur session en cours'}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                    disabled={quickActivating || !quickActivateValid}
                    onClick={handleQuickActivate}>
                    {quickActivating ? '...' : 'Activer'}
                  </button>
                )}
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
                {isSessionOpen ? (
                  <button className="btn btn-sm" style={{ fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
                    disabled={quickActivating || !quickActivateValid}
                    onClick={handleQuickActivate}>
                    {quickActivating ? '...' : 'Activer sur session en cours'}
                  </button>
                ) : (
                  <button className="btn btn-sm btn-primary" style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                    disabled={quickActivating || !quickActivateValid}
                    onClick={handleQuickActivate}>
                    {quickActivating ? '...' : 'Activer'}
                  </button>
                )}
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

      {/* ══════════════════════════════════════════════════
          SECTION 4 — Liste détaillée des lots
          ══════════════════════════════════════════════════ */}
      {batchesError && (
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{batchesError}</div>
      )}

      {batches === null && !batchesError && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>
      )}

      {batches && batches.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aucun lot créé</div>
      )}

      {batches && batches.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginTop: 4, marginBottom: 4 }}>
            Tous les lots ({batches.length})
          </div>

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
                        {/* Activate single — only if no session assigned and current session exists */}
                        {!batch.session_id && canActivate && (
                          isSessionOpen ? (
                            <button className="btn btn-sm" style={{ fontSize: 11, background: '#f59e0b', color: '#fff', border: 'none' }}
                              disabled={activating}
                              onClick={(e) => { e.stopPropagation(); handleActivateSingle(batch.batch_number); }}>
                              {activating ? '...' : `Activer sur ${currentSession.name} (en cours)`}
                            </button>
                          ) : (
                            <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                              disabled={activating}
                              onClick={(e) => { e.stopPropagation(); handleActivateSingle(batch.batch_number); }}>
                              {activating ? '...' : `Activer sur ${currentSession.name}`}
                            </button>
                          )
                        )}

                        {!batch.session_id && !canActivate && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Aucune session courante pour activer ce lot
                          </span>
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
