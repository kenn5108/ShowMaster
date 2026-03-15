import { useRef, useCallback, useEffect } from 'react';

/**
 * useTouchDrag — touch-based drag & drop for reorderable lists.
 *
 * Visual feedback:
 *  - .touch-drag-armed  → row is ready to be dragged (hold feedback)
 *  - .touch-dragging     → row is being dragged (source)
 *  - .touch-drag-over    → insertion line shown BELOW this row
 *  - .touch-drag-over-above → insertion line shown ABOVE this row (for pos 0)
 *
 * Drop in empty zone below last item → treated as "move to last position".
 * Requires the scrollable list container to have: data-drag-list="<itemCount>"
 */

const ARM_DELAY = 300;     // ms before drag is armed
const MOVE_THRESHOLD = 10; // px — movement beyond this cancels arming

// ── TRACE HELPER ──
const _td = (ctx, ...args) => console.log(`[TD][${ctx}]`, ...args);

function _dumpClasses(label) {
  const armed = document.querySelectorAll('.touch-drag-armed');
  const dragging = document.querySelectorAll('.touch-dragging');
  const over = document.querySelectorAll('.touch-drag-over');
  const overAbove = document.querySelectorAll('.touch-drag-over-above');
  if (armed.length || dragging.length || over.length || overAbove.length) {
    console.log(`[TD][${label}] CSS classes in DOM → armed:${armed.length} dragging:${dragging.length} over:${over.length} overAbove:${overAbove.length}`);
  } else {
    console.log(`[TD][${label}] CSS classes in DOM → CLEAN (none)`);
  }
}

export function useTouchDrag(onMove) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const stateRef = useRef({
    // Arming phase
    armTimer: null,
    armed: false,
    startX: 0,
    startY: 0,
    startIdx: null,
    startRow: null,
    // Drag phase
    active: false,
    fromIdx: null,
    overIdx: null,
    fromEl: null,
    overEl: null,
  });

  // ── Cleanup helper ──
  const cleanup = useCallback(() => {
    const s = stateRef.current;
    _td('cleanup', `CALLED — armed=${s.armed} active=${s.active} fromIdx=${s.fromIdx} startIdx=${s.startIdx} startRow=${!!s.startRow} fromEl=${!!s.fromEl}`);
    if (s.armTimer) { clearTimeout(s.armTimer); s.armTimer = null; }
    if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
    if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }
    // Safety: remove any lingering drag classes from DOM (handles stale refs)
    document.querySelectorAll('.touch-drag-armed, .touch-dragging, .touch-drag-over, .touch-drag-over-above')
      .forEach(el => el.classList.remove('touch-drag-armed', 'touch-dragging', 'touch-drag-over', 'touch-drag-over-above'));
    Object.assign(s, {
      armTimer: null, armed: false,
      startX: 0, startY: 0, startIdx: null, startRow: null,
      active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
    });
    _dumpClasses('cleanup-after');
  }, []);

  // ── Update hover target with insertion indicator ──
  const updateHover = useCallback((touchX, touchY, s) => {
    const target = document.elementFromPoint(touchX, touchY);
    const row = target?.closest('[data-drag-idx]');

    // Clear previous hover
    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }

    if (row) {
      const overIdx = parseInt(row.dataset.dragIdx, 10);
      if (!isNaN(overIdx)) {
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = touchY < midY;

        let effectiveIdx;
        if (insertBefore) {
          effectiveIdx = overIdx;
        } else {
          effectiveIdx = overIdx + 1;
        }

        s.overIdx = effectiveIdx;
        s.overEl = row;

        if (effectiveIdx !== s.fromIdx && effectiveIdx !== s.fromIdx + 1) {
          if (insertBefore) {
            row.classList.add('touch-drag-over-above');
          } else {
            row.classList.add('touch-drag-over');
          }
        }
      }
    } else {
      const listEl = target?.closest('[data-drag-list]');
      if (listEl) {
        const count = parseInt(listEl.dataset.dragList, 10);
        if (!isNaN(count) && count > 0) {
          const lastRow = listEl.querySelector(`[data-drag-idx="${count - 1}"]`);
          if (lastRow) {
            s.overIdx = count;
            s.overEl = lastRow;
            if (s.fromIdx !== count - 1) {
              lastRow.classList.add('touch-drag-over');
            }
          }
        }
      }
    }
  }, []);

  // ── Activate drag (shared between row-hold and handle-instant) ──
  const activateDrag = useCallback((idx, row) => {
    const s = stateRef.current;
    _td('activateDrag', `idx=${idx} row=${!!row}`);
    s.active = true;
    s.fromIdx = idx;
    s.overIdx = idx;
    s.fromEl = row;
    s.overEl = null;
    if (row) {
      row.classList.remove('touch-drag-armed');
      row.classList.add('touch-dragging');
    }
  }, []);

  // ── Row-level touch handlers (hold-then-drag) ──
  const rowTouchHandlers = useCallback((idx) => ({
    onTouchStart: (e) => {
      const s = stateRef.current;
      _td('row.touchStart', `idx=${idx} armed=${s.armed} active=${s.active}`);

      // If previous drag left lingering state, force cleanup
      if (s.active || s.armed) {
        _td('row.touchStart', 'LINGERING STATE DETECTED — forcing cleanup');
        cleanup();
      }

      const touch = e.touches[0];
      const row = e.currentTarget.closest('[data-drag-idx]');

      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.startIdx = idx;
      s.startRow = row;
      s.armed = false;

      _td('row.touchStart', `startIdx=${idx} row=${!!row} — arming in ${ARM_DELAY}ms`);

      s.armTimer = setTimeout(() => {
        s.armTimer = null;
        s.armed = true;
        _td('armTimer', `FIRED — idx=${idx} row=${!!row} adding .touch-drag-armed`);
        if (row) row.classList.add('touch-drag-armed');
        _dumpClasses('armTimer-after');
      }, ARM_DELAY);
    },

    onTouchMove: (e) => {
      const s = stateRef.current;

      // Phase 1: still in arming window
      if (s.armTimer) {
        const touch = e.touches[0];
        const dx = touch.clientX - s.startX;
        const dy = touch.clientY - s.startY;
        if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
          _td('row.touchMove', `MOVE during arm window (dx=${dx.toFixed(1)} dy=${dy.toFixed(1)}) — CANCEL arm timer`);
          clearTimeout(s.armTimer);
          s.armTimer = null;
          s.startIdx = null;
          s.startRow = null;
        }
        return;
      }

      // Phase 2: armed but drag not yet activated
      if (s.armed && !s.active) {
        _td('row.touchMove', `ARMED + MOVED → activating drag idx=${s.startIdx}`);
        e.preventDefault();
        activateDrag(s.startIdx, s.startRow);
      }

      // Phase 3: active drag
      if (s.active) {
        e.preventDefault();
        const touch = e.touches[0];
        updateHover(touch.clientX, touch.clientY, s);
      }
    },

    onTouchEnd: () => {
      const s = stateRef.current;
      _td('row.touchEnd', `armed=${s.armed} active=${s.active} armTimer=${!!s.armTimer} fromIdx=${s.fromIdx} overIdx=${s.overIdx}`);

      if (s.armTimer) {
        _td('row.touchEnd', 'arm timer still pending — CLEAR (tap too short for arm)');
        clearTimeout(s.armTimer);
        s.armTimer = null;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      if (s.armed && !s.active) {
        _td('row.touchEnd', 'armed but NOT active (held but no move) — REMOVE .touch-drag-armed');
        if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
        s.armed = false;
        s.startIdx = null;
        s.startRow = null;
        _dumpClasses('touchEnd-armed-noDrag');
        return;
      }

      if (s.active) {
        const { fromIdx, overIdx } = s;
        _td('row.touchEnd', `ACTIVE drag complete — fromIdx=${fromIdx} overIdx=${overIdx}`);
        cleanup();
        if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
          const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
          _td('row.touchEnd', `MOVE: fromIdx=${fromIdx} → destIdx=${destIdx}`);
          if (destIdx !== fromIdx) {
            onMoveRef.current(fromIdx, destIdx);
          }
        } else {
          _td('row.touchEnd', 'no effective move (same position)');
        }
      } else {
        _td('row.touchEnd', 'NOT armed, NOT active — no-op (normal tap?)');
      }
    },
  }), [activateDrag, cleanup, updateHover]);

  // ── Handle-level instant drag (legacy) ──
  const handleTouchStart = useCallback((idx, e) => {
    _td('handle.touchStart', `idx=${idx}`);
    e.stopPropagation();
    e.preventDefault();
    const row = e.currentTarget.closest('[data-drag-idx]');
    activateDrag(idx, row);
  }, [activateDrag]);

  // ── Global touchmove/touchend for handle-initiated drags ──
  useEffect(() => {
    const onDocTouchMove = (e) => {
      const s = stateRef.current;
      if (!s.active) return;
      e.preventDefault();
      const touch = e.touches[0];
      updateHover(touch.clientX, touch.clientY, s);
    };

    const onDocTouchEnd = () => {
      const s = stateRef.current;
      if (!s.active) return;

      _td('doc.touchEnd', `ACTIVE drag — fromIdx=${s.fromIdx} overIdx=${s.overIdx}`);
      const { fromIdx, overIdx } = s;
      cleanup();
      if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
        const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
        _td('doc.touchEnd', `MOVE: fromIdx=${fromIdx} → destIdx=${destIdx}`);
        if (destIdx !== fromIdx) {
          onMoveRef.current(fromIdx, destIdx);
        }
      }
    };

    document.addEventListener('touchmove', onDocTouchMove, { passive: false });
    document.addEventListener('touchend', onDocTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
    };
  }, [cleanup, updateHover]);

  // Expose drag state for coordination with other hooks (e.g. useLongPress)
  const isDragging = useCallback(() => {
    const s = stateRef.current;
    const result = s.active || s.armed;
    _td('isDragging', `active=${s.active} armed=${s.armed} → ${result}`);
    return result;
  }, []);

  return { handleTouchStart, rowTouchHandlers, isDragging };
}
