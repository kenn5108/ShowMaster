import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../utils/api';

const STATUS_LABELS = {
  draft: 'Brouillon',
  waiting: 'En attente',
  open: 'Ouverte',
  full: 'Complète',
  closed: 'Fermée',
};

/**
 * JukeboxTagRules — Éditeur session-centric des règles de tags + modèles
 *
 * Props:
 *   sessions   — array of Jukebox sessions (from parent)
 *   tags       — { tags: [{ name, hidden }] } from parent
 *   connected  — boolean
 */
export default function JukeboxTemplates({ sessions, tags, connected }) {
  // ── Session selector ──
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [loadingRules, setLoadingRules] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // ── Editor form (works for both session editing and template editing) ──
  const [form, setForm] = useState(emptyForm());
  const [dirty, setDirty] = useState(false);
  const [ruleForm, setRuleForm] = useState(emptyRule());

  // ── Save to session ──
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // ── Templates ──
  const [templates, setTemplates] = useState([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // ── Template editor (secondary, for managing templates) ──
  const [tplEditing, setTplEditing] = useState(null); // null | 'new' | template object
  const [tplForm, setTplForm] = useState(emptyForm());
  const [tplRuleForm, setTplRuleForm] = useState(emptyRule());
  const [tplDeleteConfirm, setTplDeleteConfirm] = useState(null);

  // ── Save as template modal ──
  const [saveAsName, setSaveAsName] = useState('');
  const [showSaveAs, setShowSaveAs] = useState(false);

  // ── Add-to-order ref (avoids document.getElementById) ──
  const orderTagRef = useRef(null);
  const tplOrderTagRef = useRef(null);

  // Available tags from catalog
  const availableTags = (tags?.tags || []).map(t => t.name).sort();

  // Activable sessions: draft + waiting + open
  const activableSessions = (sessions || []).filter(s =>
    ['draft', 'waiting', 'open'].includes(s.status)
  );
  const currentSession = (sessions || []).find(s => s.is_current == 1);

  // ── Auto-select current session ──
  useEffect(() => {
    if (!selectedSessionId && currentSession) {
      setSelectedSessionId(String(currentSession.id));
    }
  }, [currentSession]);

  // ── Load rules when session changes ──
  useEffect(() => {
    if (selectedSessionId && connected) {
      loadSessionRules(selectedSessionId);
    } else {
      setForm(emptyForm());
      setDirty(false);
    }
  }, [selectedSessionId, connected]);

  // ── Load templates on mount ──
  useEffect(() => { loadTemplates(); }, []);

  // ── Helpers ──
  function emptyForm() {
    return { rules: [], tagOrder: [], orderEnabled: false, orderMode: 'placement' };
  }
  function emptyRule() {
    return { tag: '', hidden: false, max_total: '', max_pending: '', visible_from: '', visible_until: '', hide_when_full: false };
  }

  function remoteToForm(data) {
    const rules = (data.rules || []).map(r => ({
      tag: r.tag,
      hidden: !!r.hidden,
      max_total: r.max_total != null ? String(r.max_total) : '',
      max_pending: r.max_pending != null ? String(r.max_pending) : '',
      visible_from: r.visible_from || '',
      visible_until: r.visible_until || '',
      hide_when_full: !!r.hide_when_full,
    }));
    const tagOrder = data.tag_order || [];
    const orderMode = data.order_mode || data.mode || 'placement';
    return {
      rules,
      tagOrder,
      orderEnabled: tagOrder.length > 0,
      orderMode,
    };
  }

  function formToPayload(f) {
    return {
      rules: f.rules.map(r => ({
        tag: r.tag,
        hidden: r.hidden,
        max_total: r.max_total !== '' ? parseInt(r.max_total, 10) : null,
        max_pending: r.max_pending !== '' ? parseInt(r.max_pending, 10) : null,
        visible_from: r.visible_from || null,
        visible_until: r.visible_until || null,
        hide_when_full: r.hide_when_full,
      })),
      tag_order: f.orderEnabled && f.tagOrder.length > 0 ? f.tagOrder : null,
      order_mode: f.orderEnabled && f.tagOrder.length > 0 ? f.orderMode : null,
    };
  }

  // ── Load session rules from remote ──
  async function loadSessionRules(sessionId) {
    setLoadingRules(true);
    setLoadError(null);
    setSaveResult(null);
    try {
      const data = await api.get(`/plugins/jukebox/tag-rules/${sessionId}`);
      setForm(remoteToForm(data));
      setDirty(false);
    } catch (err) {
      // 404 = no rules yet, which is fine
      if (err.message.includes('404')) {
        setForm(emptyForm());
        setDirty(false);
      } else {
        setLoadError(err.message);
      }
    } finally {
      setLoadingRules(false);
    }
  }

  // ── Save rules to session ──
  async function saveToSession() {
    if (!selectedSessionId) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const payload = {
        session_id: parseInt(selectedSessionId, 10),
        ...formToPayload(form),
      };
      await api.post('/plugins/jukebox/tag-rules', payload);
      setSaveResult({ ok: true });
      setDirty(false);
    } catch (err) {
      setSaveResult({ ok: false, error: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── Templates CRUD ──
  async function loadTemplates() {
    try {
      setTemplatesLoading(true);
      const data = await api.get('/plugins/jukebox/templates');
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('loadTemplates:', err);
    } finally {
      setTemplatesLoading(false);
    }
  }

  function applyTemplateToEditor(tpl) {
    setForm({
      rules: tpl.rules.map(r => ({
        tag: r.tag,
        hidden: !!r.hidden,
        max_total: r.max_total != null ? String(r.max_total) : '',
        max_pending: r.max_pending != null ? String(r.max_pending) : '',
        visible_from: r.visible_from || '',
        visible_until: r.visible_until || '',
        hide_when_full: !!r.hide_when_full,
      })),
      tagOrder: tpl.tag_order || [],
      orderEnabled: !!(tpl.tag_order && tpl.tag_order.length > 0),
      orderMode: tpl.order_mode || 'placement',
    });
    setDirty(true);
    setSaveResult(null);
  }

  async function saveAsTemplate() {
    if (!saveAsName.trim()) return;
    try {
      const payload = { name: saveAsName.trim(), ...formToPayload(form) };
      await api.post('/plugins/jukebox/templates', payload);
      await loadTemplates();
      setShowSaveAs(false);
      setSaveAsName('');
    } catch (err) {
      alert(err.message);
    }
  }

  async function saveTemplateEdit() {
    const payload = {
      name: tplForm.name?.trim(),
      ...formToPayload(tplForm),
    };
    try {
      if (tplEditing === 'new') {
        if (!payload.name) return;
        await api.post('/plugins/jukebox/templates', payload);
      } else {
        await api.put(`/plugins/jukebox/templates/${tplEditing.id}`, payload);
      }
      await loadTemplates();
      setTplEditing(null);
    } catch (err) {
      alert(err.message);
    }
  }

  async function deleteTemplate(id) {
    try {
      await api.delete(`/plugins/jukebox/templates/${id}`);
      setTplDeleteConfirm(null);
      await loadTemplates();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Form mutations (shared logic, parameterized for main or tpl) ──
  function addRule(target, setTarget, rf, setRf) {
    if (!rf.tag) return;
    if (target.rules.some(r => r.tag === rf.tag)) return;
    setTarget(f => ({ ...f, rules: [...f.rules, { ...rf }] }));
    setRf(emptyRule());
    if (target === form) setDirty(true);
  }
  function removeRule(idx, target, setTarget) {
    setTarget(f => ({ ...f, rules: f.rules.filter((_, i) => i !== idx) }));
    if (target === form) setDirty(true);
  }
  function addToOrder(tag, target, setTarget) {
    if (target.tagOrder.includes(tag)) return;
    setTarget(f => ({ ...f, tagOrder: [...f.tagOrder, tag] }));
    if (target === form) setDirty(true);
  }
  function removeFromOrder(idx, target, setTarget) {
    setTarget(f => ({ ...f, tagOrder: f.tagOrder.filter((_, i) => i !== idx) }));
    if (target === form) setDirty(true);
  }
  function moveInOrder(idx, dir, target, setTarget) {
    setTarget(f => {
      const arr = [...f.tagOrder];
      const t = idx + dir;
      if (t < 0 || t >= arr.length) return f;
      [arr[idx], arr[t]] = [arr[t], arr[idx]];
      return { ...f, tagOrder: arr };
    });
    if (target === form) setDirty(true);
  }

  function ruleSummary(r) {
    const parts = [];
    if (r.hidden) parts.push('masqué');
    if (r.max_total !== '' && r.max_total != null) parts.push(`max ${r.max_total}`);
    if (r.max_pending !== '' && r.max_pending != null) parts.push(`max pending ${r.max_pending}`);
    if (r.visible_from) parts.push(`de ${r.visible_from}`);
    if (r.visible_until) parts.push(`jusqu'à ${r.visible_until}`);
    if (r.hide_when_full) parts.push('masquer si plein');
    return parts.join(' · ') || 'aucune restriction';
  }

  // ── Shared editor blocks ──
  function renderRestrictionsBlock(f, setF, rf, setRf, prefix) {
    const unusedTags = availableTags.filter(t => !f.rules.some(r => r.tag === t));
    return (
      <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
          Restrictions de tags
        </h4>
        {f.rules.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            {f.rules.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', marginBottom: 4, borderRadius: 4,
                background: 'rgba(255,255,255,0.03)', fontSize: 12,
              }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#3b82f6' }}>{r.tag}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{ruleSummary(r)}</span>
                </div>
                <button style={{ fontSize: 11, padding: '2px 6px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onClick={() => removeRule(i, f, setF)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '8px 10px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 160, fontSize: 12 }} value={rf.tag}
              onChange={e => setRf(p => ({ ...p, tag: e.target.value }))}>
              <option value="">— Tag —</option>
              {unusedTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={rf.hidden} onChange={e => setRf(p => ({ ...p, hidden: e.target.checked }))} /> Masqué
            </label>
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={rf.hide_when_full} onChange={e => setRf(p => ({ ...p, hide_when_full: e.target.checked }))} /> Masquer si plein
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max total
              <input type="number" className="input" style={{ width: 60, marginLeft: 4, fontSize: 12 }}
                value={rf.max_total} onChange={e => setRf(p => ({ ...p, max_total: e.target.value }))} min="0" placeholder="—" />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max pending
              <input type="number" className="input" style={{ width: 60, marginLeft: 4, fontSize: 12 }}
                value={rf.max_pending} onChange={e => setRf(p => ({ ...p, max_pending: e.target.value }))} min="0" placeholder="—" />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visible de
              <input type="time" className="input" style={{ width: 90, marginLeft: 4, fontSize: 12 }}
                value={rf.visible_from} onChange={e => setRf(p => ({ ...p, visible_from: e.target.value }))} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>à
              <input type="time" className="input" style={{ width: 90, marginLeft: 4, fontSize: 12 }}
                value={rf.visible_until} onChange={e => setRf(p => ({ ...p, visible_until: e.target.value }))} />
            </label>
          </div>
          <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} disabled={!rf.tag}
            onClick={() => addRule(f, setF, rf, setRf)}>+ Ajouter cette restriction</button>
        </div>
      </div>
    );
  }

  function renderOrderBlock(f, setF, ref, prefix) {
    const unorderedTags = availableTags.filter(t => !f.tagOrder.includes(t));
    return (
      <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
          Ordre des tags
          <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>(facultatif)</span>
        </h4>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--text-muted)' }}>
          <input type="checkbox" checked={f.orderEnabled}
            onChange={e => { setF(p => ({ ...p, orderEnabled: e.target.checked })); if (f === form) setDirty(true); }} />
          Définir un ordre de tags
        </label>
        {f.orderEnabled && (
          <>
            <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <input type="radio" name={`${prefix}OrderMode`} value="placement"
                  checked={f.orderMode === 'placement'}
                  onChange={() => { setF(p => ({ ...p, orderMode: 'placement' })); if (f === form) setDirty(true); }} />
                Placement seulement
              </label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <input type="radio" name={`${prefix}OrderMode`} value="placement_restriction"
                  checked={f.orderMode === 'placement_restriction'}
                  onChange={() => { setF(p => ({ ...p, orderMode: 'placement_restriction' })); if (f === form) setDirty(true); }} />
                Placement + restriction
              </label>
            </div>
            {f.tagOrder.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                {f.tagOrder.map((tag, i) => (
                  <div key={tag} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px', marginBottom: 3, borderRadius: 4,
                    background: 'rgba(255,255,255,0.03)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 20, textAlign: 'center' }}>{i + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{tag}</span>
                    <button style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                      disabled={i === 0} onClick={() => moveInOrder(i, -1, f, setF)}>▲</button>
                    <button style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                      disabled={i === f.tagOrder.length - 1} onClick={() => moveInOrder(i, 1, f, setF)}>▼</button>
                    <button style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                      onClick={() => removeFromOrder(i, f, setF)}>✕</button>
                  </div>
                ))}
              </div>
            )}
            {unorderedTags.length > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select className="input" style={{ width: 160, fontSize: 12 }} ref={ref} defaultValue="">
                  <option value="">— Ajouter un tag —</option>
                  {unorderedTags.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                  onClick={() => { if (ref.current?.value) { addToOrder(ref.current.value, f, setF); ref.current.value = ''; } }}>
                  + Ajouter</button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ════════════════════════════════
  //  RENDER — Template editor (secondary, inline below templates list)
  // ════════════════════════════════
  if (tplEditing !== null) {
    const isNew = tplEditing === 'new';
    const canSave = isNew ? (tplForm.name || '').trim().length > 0 : true;
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            {isNew ? 'Nouveau modèle' : `Modifier : ${tplEditing.name}`}
          </h3>
          <button className="btn btn-sm btn-secondary" onClick={() => setTplEditing(null)}>Annuler</button>
        </div>
        {/* Name (only for new or rename) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nom du modèle</label>
          <input type="text" className="input" style={{ width: '100%' }}
            value={tplForm.name || ''}
            onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex. Soirée standard" />
        </div>
        {renderRestrictionsBlock(tplForm, setTplForm, tplRuleForm, setTplRuleForm, 'tpl')}
        {renderOrderBlock(tplForm, setTplForm, tplOrderTagRef, 'tpl')}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={!canSave} onClick={saveTemplateEdit}>
            {isNew ? 'Créer le modèle' : 'Enregistrer'}
          </button>
          <button className="btn btn-secondary" onClick={() => setTplEditing(null)}>Annuler</button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════
  //  RENDER — Main view (session editor + templates)
  // ════════════════════════════════
  const selectedSession = activableSessions.find(s => String(s.id) === selectedSessionId);

  return (
    <div>
      <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Règles de tags</h3>

      {/* ── Session selector ── */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Session cible</label>
        <select className="input" style={{ width: '100%', fontSize: 13 }}
          value={selectedSessionId}
          onChange={e => setSelectedSessionId(e.target.value)}>
          <option value="">— Choisir une session —</option>
          {activableSessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({STATUS_LABELS[s.status] || s.status}){s.is_current == 1 ? ' ★' : ''}
            </option>
          ))}
        </select>
      </div>

      {!selectedSessionId && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
          Sélectionnez une session pour voir et modifier ses règles de tags.
        </div>
      )}

      {selectedSessionId && !connected && (
        <div style={{ fontSize: 12, color: '#f59e0b', padding: '8px 0' }}>
          Connexion Jukebox inactive — impossible de charger les règles.
        </div>
      )}

      {loadingRules && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement des règles...</div>
      )}

      {loadError && (
        <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>Erreur : {loadError}</div>
      )}

      {/* ── Session editor ── */}
      {selectedSessionId && connected && !loadingRules && !loadError && (
        <>
          {/* Quick actions bar */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
            {/* Apply template dropdown */}
            {templates.length > 0 && (
              <select className="input" style={{ fontSize: 12, width: 200 }} defaultValue=""
                onChange={e => {
                  const tpl = templates.find(t => String(t.id) === e.target.value);
                  if (tpl) applyTemplateToEditor(tpl);
                  e.target.value = '';
                }}>
                <option value="">Appliquer un modèle...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {/* Save as template */}
            {form.rules.length > 0 && (
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
                onClick={() => { setShowSaveAs(true); setSaveAsName(''); }}>
                Enregistrer comme modèle
              </button>
            )}
          </div>

          {/* Save-as-template mini form */}
          {showSaveAs && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
              <input type="text" className="input" style={{ flex: 1, fontSize: 12 }}
                value={saveAsName} onChange={e => setSaveAsName(e.target.value)}
                placeholder="Nom du modèle" autoFocus />
              <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
                disabled={!saveAsName.trim()} onClick={saveAsTemplate}>Enregistrer</button>
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
                onClick={() => setShowSaveAs(false)}>Annuler</button>
            </div>
          )}

          {/* Restrictions bloc */}
          {renderRestrictionsBlock(form, (fn) => { setForm(fn); setDirty(true); }, ruleForm, setRuleForm, 'session')}

          {/* Order bloc */}
          {renderOrderBlock(form, (fn) => { setForm(fn); setDirty(true); }, orderTagRef, 'session')}

          {/* Save to session button */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-primary"
              style={{ background: '#f59e0b', color: '#000', fontWeight: 600 }}
              disabled={saving}
              onClick={saveToSession}>
              {saving ? 'Sauvegarde...' : 'Sauvegarder sur la session'}
            </button>
            {dirty && <span style={{ fontSize: 11, color: '#f59e0b' }}>Modifications non sauvegardées</span>}
          </div>

          {/* Save result */}
          {saveResult && (
            <div style={{
              fontSize: 12, marginTop: 8, padding: '6px 10px', borderRadius: 4,
              background: saveResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              color: saveResult.ok ? 'var(--success)' : '#ef4444',
            }}>
              {saveResult.ok ? 'Règles sauvegardées sur la session' : `Erreur : ${saveResult.error}`}
            </div>
          )}
        </>
      )}

      {/* ── Templates section (collapsible, secondary) ── */}
      <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, cursor: 'pointer' }}
          onClick={() => setTemplatesOpen(o => !o)}>
          <h4 style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            {templatesOpen ? '▾' : '▸'} Modèles enregistrés
            <span style={{ fontWeight: 400, fontSize: 11, marginLeft: 6 }}>({templates.length})</span>
          </h4>
          <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }}
            onClick={e => {
              e.stopPropagation();
              setTplForm({ ...emptyForm(), name: '' });
              setTplRuleForm(emptyRule());
              setTplEditing('new');
            }}>+ Nouveau</button>
        </div>

        {templatesOpen && (
          <>
            {templatesLoading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>}
            {!templatesLoading && templates.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                Aucun modèle enregistré.
              </div>
            )}
            {templates.map(tpl => (
              <div key={tpl.id} style={{
                padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                background: 'var(--bg-secondary)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{tpl.name}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => {
                        setTplForm({
                          name: tpl.name,
                          rules: tpl.rules.map(r => ({
                            tag: r.tag, hidden: !!r.hidden,
                            max_total: r.max_total != null ? String(r.max_total) : '',
                            max_pending: r.max_pending != null ? String(r.max_pending) : '',
                            visible_from: r.visible_from || '', visible_until: r.visible_until || '',
                            hide_when_full: !!r.hide_when_full,
                          })),
                          tagOrder: tpl.tag_order || [],
                          orderEnabled: !!(tpl.tag_order && tpl.tag_order.length > 0),
                          orderMode: tpl.order_mode || 'placement',
                        });
                        setTplRuleForm(emptyRule());
                        setTplEditing(tpl);
                      }}>Modifier</button>
                    {tplDeleteConfirm === tpl.id ? (
                      <>
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}
                          onClick={() => deleteTemplate(tpl.id)}>Confirmer</button>
                        <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => setTplDeleteConfirm(null)}>Non</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '2px 6px', color: '#ef4444' }}
                        onClick={() => setTplDeleteConfirm(tpl.id)}>Suppr.</button>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {tpl.rules.length > 0
                    ? `${tpl.rules.length} restriction${tpl.rules.length > 1 ? 's' : ''}`
                    : 'Aucune restriction'}
                  {tpl.tag_order && tpl.tag_order.length > 0 && (
                    <span> · Ordre : {tpl.tag_order.length} tags ({tpl.order_mode === 'placement_restriction' ? 'P+R' : 'P'})</span>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
