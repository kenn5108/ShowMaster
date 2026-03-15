import { useRef, useCallback, useEffect } from 'react';

/**
 * useTouchDrag — touch-based drag & drop for reorderable lists.
 *
 * Supports TWO modes of activation:
 *
 * 1. ROW-LEVEL hold-then-drag (new):
 *    - Attach rowTouchHandlers(idx) to each row's onTouchStart / onTouchMove / onTouchEnd
 *    - touchstart starts a 300ms arm timer
 *    - If finger moves > 10px before timer → cancel (allow scroll)
 *    - If timer fires (finger stayed still) → ARM the row:
 *        · adds .touch-drag-armed CSS class (strong visual feedback)
 *        · prevents scroll via preventDefault on subsequent touchmove
 *    - Further finger movement while armed → DRAG (same reorder logic as before)
 *    - touchend without drag → no-op (existing press/context logic proceeds)
 *
 * 2. HANDLE-LEVEL instant drag (legacy, still works):
 *    - handleTouchStart(idx, e) on a drag handle immediately activates drag
 *
 * The 300ms arm delay is shorter than useLongPress's 500ms context menu delay,
 * so there's no conflict: drag arms at 300ms, context menu fires at 500ms.
 * If the finger starts moving between 300ms and 500ms → drag wins.
 * If the finger stays still past 500ms → context menu wins (where it exists).
 *
 * Usage:
 *   const touchDrag = useTouchDrag((fromIdx, toIdx) => { ... });
 *
 *   <div data-drag-idx={idx}
 *        {...touchDrag.rowTouchHandlers(idx)}
 *        ...>
 *
 * HTML5 drag on desktop is NOT affected by this hook.
 */

const ARM_DELAY = 300;     // ms before drag is armed
const MOVE_THRESHOLD = 10; // px — movement beyond this cancels arming

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
    // Drag phase (same as before)
    active: false,
    fromIdx: null,
    overIdx: null,
    fromEl: null,
    overEl: null,
  });

  // ── Cleanup helper ──
  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (s.armTimer) { clearTimeout(s.armTimer); s.armTimer = null; }
    if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
    if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
    if (s.overEl) s.overEl.classList.remove('touch-drag-over');
    Object.assign(s, {
      armTimer: null, armed: false,
      startX: 0, startY: 0, startIdx: null, startRow: null,
      active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
    });
  }, []);

  // ── Activate drag (shared between row-hold and handle-instant) ──
  const activateDrag = useCallback((idx, row) => {
    const s = stateRef.current;
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
      // Don't interfere if already dragging
      if (s.active || s.armed) return;

      const touch = e.touches[0];
      const row = e.currentTarget.closest('[data-drag-idx]');

      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.startIdx = idx;
      s.startRow = row;
      s.armed = false;

      // Start arm timer — do NOT preventDefault here (scroll must work)
      s.armTimer = setTimeout(() => {
        s.armTimer = null;
        s.armed = true;
        if (row) row.classList.add('touch-drag-armed');
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
          // Finger moved too much → cancel arm, allow scroll
          clearTimeout(s.armTimer);
          s.armTimer = null;
          s.startIdx = null;
          s.startRow = null;
        }
        return; // Let browser handle scroll
      }

      // Phase 2: armed but drag not yet activated
      if (s.armed && !s.active) {
        e.preventDefault(); // Prevent scroll — we're taking over
        activateDrag(s.startIdx, s.startRow);
        // Fall through to drag handling below
      }

      // Phase 3: active drag
      if (s.active) {
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const row = target?.closest('[data-drag-idx]');

        if (s.overEl && s.overEl !== row) {
          s.overEl.classList.remove('touch-drag-over');
        }
        if (row) {
          const overIdx = parseInt(row.dataset.dragIdx, 10);
          if (!isNaN(overIdx)) {
            s.overIdx = overIdx;
            s.overEl = row;
            if (overIdx !== s.fromIdx) {
              row.classList.add('touch-drag-over');
            }
          }
        }
      }
    },

    onTouchEnd: () => {
      const s = stateRef.current;

      // If arm timer still running, cancel it (was a tap — let other handlers deal with it)
      if (s.armTimer) {
        clearTimeout(s.armTimer);
        s.armTimer = null;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      // If armed but never dragged, just cleanup (no-op)
      if (s.armed && !s.active) {
        if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
        s.armed = false;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      // If active drag, finalize
      if (s.active) {
        const { fromIdx, overIdx } = s;
        cleanup();
        if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx) {
          onMoveRef.current(fromIdx, overIdx);
        }
      }
    },
  }), [activateDrag, cleanup]);

  // ── Handle-level instant drag (legacy — for the ⠿ handle) ──
  const handleTouchStart = useCallback((idx, e) => {
    e.stopPropagation();
    e.preventDefault();
    const row = e.currentTarget.closest('[data-drag-idx]');
    activateDrag(idx, row);
  }, [activateDrag]);

  // ── Global touchmove/touchend for handle-initiated drags ──
  // (Row-initiated drags use the row's own handlers, but handle-initiated
  //  drags need document-level listeners since the handle is a small target)
  useEffect(() => {
    const onDocTouchMove = (e) => {
      const s = stateRef.current;
      if (!s.active) return;
      // Only handle document-level if NOT using row handlers
      // (row handlers call preventDefault themselves)
      e.preventDefault();

      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = target?.closest('[data-drag-idx]');

      if (s.overEl && s.overEl !== row) {
        s.overEl.classList.remove('touch-drag-over');
      }
      if (row) {
        const overIdx = parseInt(row.dataset.dragIdx, 10);
        if (!isNaN(overIdx)) {
          s.overIdx = overIdx;
          s.overEl = row;
          if (overIdx !== s.fromIdx) {
            row.classList.add('touch-drag-over');
          }
        }
      }
    };

    const onDocTouchEnd = () => {
      const s = stateRef.current;
      if (!s.active) return;

      const { fromIdx, overIdx } = s;
      cleanup();
      if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx) {
        onMoveRef.current(fromIdx, overIdx);
      }
    };

    document.addEventListener('touchmove', onDocTouchMove, { passive: false });
    document.addEventListener('touchend', onDocTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
    };
  }, [cleanup]);

  return { handleTouchStart, rowTouchHandlers };
}
