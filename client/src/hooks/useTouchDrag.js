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
    if (s.armTimer) { clearTimeout(s.armTimer); s.armTimer = null; }
    if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
    if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }
    Object.assign(s, {
      armTimer: null, armed: false,
      startX: 0, startY: 0, startIdx: null, startRow: null,
      active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
    });
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
        // Determine if finger is in upper or lower half of the row
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const insertBefore = touchY < midY;

        // Compute effective insertion index
        let effectiveIdx;
        if (insertBefore) {
          effectiveIdx = overIdx; // insert before this row = take its position
        } else {
          effectiveIdx = overIdx + 1; // insert after this row
        }
        // Clamp: if effectiveIdx equals fromIdx or fromIdx+1, no real move
        // (but we still show the indicator for visual continuity)

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
      // Not over a row — check if we're in the list container (empty zone below items)
      const listEl = target?.closest('[data-drag-list]');
      if (listEl) {
        const count = parseInt(listEl.dataset.dragList, 10);
        if (!isNaN(count) && count > 0) {
          // Find the last row in this list to show indicator on it
          const lastRow = listEl.querySelector(`[data-drag-idx="${count - 1}"]`);
          if (lastRow) {
            s.overIdx = count; // after the last item
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
      if (s.active || s.armed) return;

      const touch = e.touches[0];
      const row = e.currentTarget.closest('[data-drag-idx]');

      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.startIdx = idx;
      s.startRow = row;
      s.armed = false;

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
          clearTimeout(s.armTimer);
          s.armTimer = null;
          s.startIdx = null;
          s.startRow = null;
        }
        return;
      }

      // Phase 2: armed but drag not yet activated
      if (s.armed && !s.active) {
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

      if (s.armTimer) {
        clearTimeout(s.armTimer);
        s.armTimer = null;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      if (s.armed && !s.active) {
        if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
        s.armed = false;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      if (s.active) {
        const { fromIdx, overIdx } = s;
        cleanup();
        if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
          // Convert insertion index to destination index:
          // If inserting after fromIdx, the source removal shifts indices down by 1
          const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
          if (destIdx !== fromIdx) {
            onMoveRef.current(fromIdx, destIdx);
          }
        }
      }
    },
  }), [activateDrag, cleanup, updateHover]);

  // ── Handle-level instant drag (legacy) ──
  const handleTouchStart = useCallback((idx, e) => {
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

      const { fromIdx, overIdx } = s;
      cleanup();
      if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
        const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
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

  return { handleTouchStart, rowTouchHandlers };
}
