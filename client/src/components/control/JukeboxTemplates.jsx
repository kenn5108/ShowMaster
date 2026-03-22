import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';

/**
 * JukeboxTemplates — CRUD + application des modèles de règles de tags
 *
 * Props:
 *   sessions   — array of Jukebox sessions (from parent)
 *   tags       — { tags: [{ name, hidden }] } from parent
 *   connected  — boolean
 */
export default function JukeboxTemplates({ sessions, tags, connected }) {
  // ── Templates list ──
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Editor state ──
  const [editing, setEditing] = useState(null);       // null = list view, 'new' | template object = editor
  const [form, setForm] = useState(emptyForm());

  // ── Apply state ──
  const [applyTarget, setApplyTarget] = useState(null); // template id being applied
  const [applySessionId, setApplySessionId] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  // ── Rule editor ──
  const [ruleForm, setRuleForm] = useState(emptyRule());

  // ── Delete confirm ──
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Available tags from catalog
  const availableTags = (tags?.tags || []).map(t => t.name).sort();

  // Activable sessions: draft + waiting + open
  const activableSessions = (sessions || []).filter(s =>
    ['draft', 'waiting', 'open'].includes(s.status)
  );

  // Current session as default apply target
  const currentSession = (sessions || []).find(s => s.is_current == 1);

  // ── Load templates ──
  useEffect(() => { loadTemplates(); }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      const data = await api.get('/plugins/jukebox/templates');
      setTemplates(data.templates || []);
    } catch (err) {
      console.error('loadTemplates:', err);
    } finally {
      setLoading(false);
    }
  }

  // ── Form helpers ──
  function emptyForm() {
    return { name: '', rules: [], tagOrder: [], orderEnabled: false, orderMode: 'placement' };
  }
  function emptyRule() {
    return { tag: '', hidden: false, max_total: '', max_pending: '', visible_from: '', visible_until: '', hide_when_full: false };
  }

  function openEditor(tpl) {
    if (tpl === 'new') {
      setForm(emptyForm());
      setEditing('new');
    } else {
      setForm({
        name: tpl.name,
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
      setEditing(tpl);
    }
    setRuleForm(emptyRule());
  }

  function closeEditor() {
    setEditing(null);
    setForm(emptyForm());
    setRuleForm(emptyRule());
  }

  // ── Save template ──
  async function saveTemplate() {
    const payload = {
      name: form.name.trim(),
      tag_order: form.orderEnabled && form.tagOrder.length > 0 ? form.tagOrder : null,
      order_mode: form.orderEnabled && form.tagOrder.length > 0 ? form.orderMode : null,
      rules: form.rules.map(r => ({
        tag: r.tag,
        hidden: r.hidden,
        max_total: r.max_total !== '' ? parseInt(r.max_total, 10) : null,
        max_pending: r.max_pending !== '' ? parseInt(r.max_pending, 10) : null,
        visible_from: r.visible_from || null,
        visible_until: r.visible_until || null,
        hide_when_full: r.hide_when_full,
      })),
    };

    try {
      if (editing === 'new') {
        await api.post('/plugins/jukebox/templates', payload);
      } else {
        await api.put(`/plugins/jukebox/templates/${editing.id}`, payload);
      }
      await loadTemplates();
      closeEditor();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Delete template ──
  async function deleteTemplate(id) {
    try {
      await api.delete(`/plugins/jukebox/templates/${id}`);
      setDeleteConfirm(null);
      await loadTemplates();
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Apply template to session ──
  async function applyTemplate(templateId) {
    if (!applySessionId) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const data = await api.post(`/plugins/jukebox/templates/${templateId}/apply`, {
        session_id: parseInt(applySessionId, 10),
      });
      setApplyResult({ ok: true });
      setApplyTarget(null);
      setApplySessionId('');
    } catch (err) {
      setApplyResult({ ok: false, error: err.message });
    } finally {
      setApplying(false);
    }
  }

  // ── Add rule to form ──
  function addRule() {
    if (!ruleForm.tag) return;
    // Don't allow duplicate tag
    if (form.rules.some(r => r.tag === ruleForm.tag)) return;
    setForm(f => ({ ...f, rules: [...f.rules, { ...ruleForm }] }));
    setRuleForm(emptyRule());
  }

  function removeRule(idx) {
    setForm(f => ({ ...f, rules: f.rules.filter((_, i) => i !== idx) }));
  }

  // ── Tag order management ──
  function addToOrder(tag) {
    if (form.tagOrder.includes(tag)) return;
    setForm(f => ({ ...f, tagOrder: [...f.tagOrder, tag] }));
  }

  function removeFromOrder(idx) {
    setForm(f => ({ ...f, tagOrder: f.tagOrder.filter((_, i) => i !== idx) }));
  }

  function moveInOrder(idx, dir) {
    setForm(f => {
      const arr = [...f.tagOrder];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return f;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return { ...f, tagOrder: arr };
    });
  }

  // ── Rule summary text ──
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

  // ───────── RENDER ─────────

  // ── Editor view ──
  if (editing !== null) {
    const canSave = form.name.trim().length > 0;
    // Tags not yet used in rules (for dropdown)
    const unusedTags = availableTags.filter(t => !form.rules.some(r => r.tag === t));
    // Tags not yet in order
    const unorderedTags = availableTags.filter(t => !form.tagOrder.includes(t));

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
            {editing === 'new' ? 'Nouveau modèle' : `Modifier : ${editing.name}`}
          </h3>
          <button className="btn btn-sm btn-secondary" onClick={closeEditor}>Annuler</button>
        </div>

        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nom du modèle</label>
          <input
            type="text"
            className="input"
            style={{ width: '100%' }}
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="ex. Soirée standard"
          />
        </div>

        {/* ── Bloc 1: Restrictions ── */}
        <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
            Restrictions de tags
          </h4>

          {/* Existing rules */}
          {form.rules.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              {form.rules.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 8px', marginBottom: 4, borderRadius: 4,
                  background: 'rgba(255,255,255,0.03)', fontSize: 12,
                }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#3b82f6' }}>{r.tag}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{ruleSummary(r)}</span>
                  </div>
                  <button
                    className="btn btn-sm"
                    style={{ fontSize: 11, padding: '2px 6px', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onClick={() => removeRule(i)}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Add rule form */}
          <div style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <select
                className="input"
                style={{ width: 160, fontSize: 12 }}
                value={ruleForm.tag}
                onChange={e => setRuleForm(f => ({ ...f, tag: e.target.value }))}
              >
                <option value="">— Tag —</option>
                {unusedTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={ruleForm.hidden} onChange={e => setRuleForm(f => ({ ...f, hidden: e.target.checked }))} />
                Masqué
              </label>
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={ruleForm.hide_when_full} onChange={e => setRuleForm(f => ({ ...f, hide_when_full: e.target.checked }))} />
                Masquer si plein
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Max total
                <input type="number" className="input" style={{ width: 60, marginLeft: 4, fontSize: 12 }}
                  value={ruleForm.max_total} onChange={e => setRuleForm(f => ({ ...f, max_total: e.target.value }))}
                  min="0" placeholder="—" />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Max pending
                <input type="number" className="input" style={{ width: 60, marginLeft: 4, fontSize: 12 }}
                  value={ruleForm.max_pending} onChange={e => setRuleForm(f => ({ ...f, max_pending: e.target.value }))}
                  min="0" placeholder="—" />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Visible de
                <input type="time" className="input" style={{ width: 90, marginLeft: 4, fontSize: 12 }}
                  value={ruleForm.visible_from} onChange={e => setRuleForm(f => ({ ...f, visible_from: e.target.value }))} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                à
                <input type="time" className="input" style={{ width: 90, marginLeft: 4, fontSize: 12 }}
                  value={ruleForm.visible_until} onChange={e => setRuleForm(f => ({ ...f, visible_until: e.target.value }))} />
              </label>
            </div>
            <button
              className="btn btn-sm btn-primary"
              style={{ fontSize: 11 }}
              disabled={!ruleForm.tag}
              onClick={addRule}
            >+ Ajouter cette restriction</button>
          </div>
        </div>

        {/* ── Bloc 2: Ordre des tags ── */}
        <div style={{ marginBottom: 20, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-secondary)' }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
            Ordre des tags
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>(facultatif)</span>
          </h4>

          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={form.orderEnabled} onChange={e => setForm(f => ({ ...f, orderEnabled: e.target.checked }))} />
            Définir un ordre de tags
          </label>

          {form.orderEnabled && (
            <>
              {/* Mode selector */}
              <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                  <input type="radio" name="orderMode" value="placement"
                    checked={form.orderMode === 'placement'}
                    onChange={() => setForm(f => ({ ...f, orderMode: 'placement' }))} />
                  Placement seulement
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                  <input type="radio" name="orderMode" value="placement_restriction"
                    checked={form.orderMode === 'placement_restriction'}
                    onChange={() => setForm(f => ({ ...f, orderMode: 'placement_restriction' }))} />
                  Placement + restriction
                </label>
              </div>

              {/* Ordered tags list with up/down/remove */}
              {form.tagOrder.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  {form.tagOrder.map((tag, i) => (
                    <div key={tag} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 8px', marginBottom: 3, borderRadius: 4,
                      background: 'rgba(255,255,255,0.03)', fontSize: 12,
                    }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 11, width: 20, textAlign: 'center' }}>{i + 1}</span>
                      <span style={{ flex: 1, fontWeight: 500 }}>{tag}</span>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        disabled={i === 0} onClick={() => moveInOrder(i, -1)}>▲</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        disabled={i === form.tagOrder.length - 1} onClick={() => moveInOrder(i, 1)}>▼</button>
                      <button className="btn btn-sm" style={{ fontSize: 10, padding: '1px 4px', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        onClick={() => removeFromOrder(i)}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add tag to order */}
              {unorderedTags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="input"
                    style={{ width: 160, fontSize: 12 }}
                    id="addOrderTag"
                    defaultValue=""
                  >
                    <option value="">— Ajouter un tag —</option>
                    {unorderedTags.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: 11 }}
                    onClick={() => {
                      const sel = document.getElementById('addOrderTag');
                      if (sel && sel.value) { addToOrder(sel.value); sel.value = ''; }
                    }}
                  >+ Ajouter</button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Save / Cancel */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" disabled={!canSave} onClick={saveTemplate}>
            {editing === 'new' ? 'Créer le modèle' : 'Enregistrer'}
          </button>
          <button className="btn btn-secondary" onClick={closeEditor}>Annuler</button>
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Modèles de tags</h3>
        <button className="btn btn-sm btn-primary" style={{ fontSize: 11 }} onClick={() => openEditor('new')}>
          + Nouveau
        </button>
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargement...</div>}

      {!loading && templates.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
          Aucun modèle. Créez-en un pour définir des restrictions et un ordre de tags réutilisables.
        </div>
      )}

      {templates.map(tpl => (
        <div key={tpl.id} style={{
          padding: '10px 12px', marginBottom: 8, borderRadius: 6,
          background: 'var(--bg-secondary)',
        }}>
          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => openEditor(tpl)}>Modifier</button>
              {deleteConfirm === tpl.id ? (
                <>
                  <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444' }}
                    onClick={() => deleteTemplate(tpl.id)}>Confirmer</button>
                  <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setDeleteConfirm(null)}>Non</button>
                </>
              ) : (
                <button className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', color: '#ef4444' }}
                  onClick={() => setDeleteConfirm(tpl.id)}>Suppr.</button>
              )}
            </div>
          </div>

          {/* Summary line */}
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            {tpl.rules.length > 0
              ? `${tpl.rules.length} restriction${tpl.rules.length > 1 ? 's' : ''}`
              : 'Aucune restriction'}
            {tpl.tag_order && tpl.tag_order.length > 0 && (
              <span> · Ordre : {tpl.tag_order.length} tags ({tpl.order_mode === 'placement_restriction' ? 'P+R' : 'P'})</span>
            )}
          </div>

          {/* Rules detail */}
          {tpl.rules.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {tpl.rules.map((r, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', padding: '1px 0' }}>
                  <span style={{ color: '#3b82f6' }}>{r.tag}</span>
                  <span style={{ marginLeft: 6 }}>{ruleSummary(r)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tag order preview */}
          {tpl.tag_order && tpl.tag_order.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Ordre : {tpl.tag_order.join(' → ')}
            </div>
          )}

          {/* Apply section */}
          {applyTarget === tpl.id ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
              <select
                className="input"
                style={{ fontSize: 12, width: 200 }}
                value={applySessionId}
                onChange={e => setApplySessionId(e.target.value)}
              >
                <option value="">— Session cible —</option>
                {activableSessions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({STATUS_LABELS[s.status] || s.status}){s.is_current == 1 ? ' ★' : ''}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm"
                style={{ fontSize: 11, background: '#f59e0b', color: '#000', fontWeight: 600 }}
                disabled={!applySessionId || applying}
                onClick={() => applyTemplate(tpl.id)}
              >
                {applying ? 'Application...' : 'Appliquer'}
              </button>
              <button className="btn btn-sm btn-secondary" style={{ fontSize: 11 }}
                onClick={() => { setApplyTarget(null); setApplySessionId(''); setApplyResult(null); }}>
                Annuler
              </button>
            </div>
          ) : (
            <button
              className="btn btn-sm"
              style={{ fontSize: 11, background: connected ? '#f59e0b' : undefined, color: connected ? '#000' : undefined, fontWeight: 500, marginTop: 2 }}
              disabled={!connected || activableSessions.length === 0}
              onClick={() => {
                setApplyTarget(tpl.id);
                setApplySessionId(currentSession ? String(currentSession.id) : '');
                setApplyResult(null);
              }}
            >
              Appliquer à une session
            </button>
          )}

          {/* Apply result */}
          {applyResult && applyTarget === null && (
            <div style={{ fontSize: 11, marginTop: 4, color: applyResult.ok ? 'var(--success)' : '#ef4444' }}>
              {applyResult.ok ? 'Modèle appliqué avec succès' : `Erreur : ${applyResult.error}`}
            </div>
          )}
        </div>
      ))}

      {/* Global apply result (shown after apply target is closed) */}
      {applyResult && applyTarget === null && (
        <div style={{ fontSize: 12, marginTop: 4, padding: '6px 10px', borderRadius: 4,
          background: applyResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          color: applyResult.ok ? 'var(--success)' : '#ef4444' }}>
          {applyResult.ok ? 'Modèle appliqué avec succès' : `Erreur : ${applyResult.error}`}
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS = {
  draft: 'Brouillon',
  waiting: 'En attente',
  open: 'Ouverte',
  full: 'Complète',
  closed: 'Fermée',
};
