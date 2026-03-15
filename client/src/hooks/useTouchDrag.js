import { useRef, useCallback, useEffect } from 'react';
import { dbg, dbgDumpClasses } from '../utils/debugLog';

/**
 * useTouchDrag — touch-based drag & drop for reorderable lists.
 */

const ARM_DELAY = 300;
const MOVE_THRESHOLD = 10;

export function useTouchDrag(onMove) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const stateRef = useRef({
    armTimer: null, armed: false,
    startX: 0, startY: 0, startIdx: null, startRow: null,
    active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
  });

  // ── Cleanup helper ──
  const cleanup = useCallback(() => {
    const s = stateRef.current;
    dbg('TD', 'cleanup', `armed=${s.armed} active=${s.active} fromIdx=${s.fromIdx} startIdx=${s.startIdx} startRow=${!!s.startRow} fromEl=${!!s.fromEl}`);
    if (s.armTimer) { clearTimeout(s.armTimer); s.armTimer = null; }
    if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
    if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }
    document.querySelectorAll('.touch-drag-armed, .touch-dragging, .touch-drag-over, .touch-drag-over-above')
      .forEach(el => el.classList.remove('touch-drag-armed', 'touch-dragging', 'touch-drag-over', 'touch-drag-over-above'));
    Object.assign(s, {
      armTimer: null, armed: false,
      startX: 0, startY: 0, startIdx: null, startRow: null,
      active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
    });
    dbgDumpClasses('TD', 'cleanup-after');
  }, []);

  // ── Update hover target with insertion indicator ──
  const updateHover = useCallback((touchX, touchY, s) => {
    const target = document.elementFromPoint(touchX, touchY);
    const row = target?.closest('[data-drag-idx]');

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
        let effectiveIdx = insertBefore ? overIdx : overIdx + 1;
        s.overIdx = effectiveIdx;
        s.overEl = row;
        if (effectiveIdx !== s.fromIdx && effectiveIdx !== s.fromIdx + 1) {
          row.classList.add(insertBefore ? 'touch-drag-over-above' : 'touch-drag-over');
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
            if (s.fromIdx !== count - 1) lastRow.classList.add('touch-drag-over');
          }
        }
      }
    }
  }, []);

  // ── Activate drag ──
  const activateDrag = useCallback((idx, row) => {
    dbg('TD', 'activateDrag', `idx=${idx} row=${!!row}`);
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
      dbg('TD', 'row.touchStart', `idx=${idx} armed=${s.armed} active=${s.active}`);

      if (s.active || s.armed) {
        dbg('TD', 'row.touchStart', 'LINGERING STATE — forcing cleanup');
        cleanup();
      }

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
        dbg('TD', 'armTimer', `FIRED idx=${idx}`);
        if (row) row.classList.add('touch-drag-armed');
        dbgDumpClasses('TD', 'armTimer-after');
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
          dbg('TD', 'row.touchMove', `CANCEL arm (dx=${dx.toFixed(1)} dy=${dy.toFixed(1)})`);
          clearTimeout(s.armTimer);
          s.armTimer = null;
          s.startIdx = null;
          s.startRow = null;
        }
        return;
      }

      // Phase 2: armed → activate
      if (s.armed && !s.active) {
        dbg('TD', 'row.touchMove', `ARMED+MOVED → activateDrag idx=${s.startIdx}`);
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
      dbg('TD', 'row.touchEnd', `armed=${s.armed} active=${s.active} armTimer=${!!s.armTimer} fromIdx=${s.fromIdx} overIdx=${s.overIdx}`);

      if (s.armTimer) {
        dbg('TD', 'row.touchEnd', 'arm pending → CLEAR (tap too short)');
        clearTimeout(s.armTimer);
        s.armTimer = null;
        s.startIdx = null;
        s.startRow = null;
        return;
      }

      if (s.armed && !s.active) {
        dbg('TD', 'row.touchEnd', 'armed+noMove → REMOVE .touch-drag-armed');
        if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
        s.armed = false;
        s.startIdx = null;
        s.startRow = null;
        dbgDumpClasses('TD', 'touchEnd-armed-noDrag');
        return;
      }

      if (s.active) {
        const { fromIdx, overIdx } = s;
        dbg('TD', 'row.touchEnd', `ACTIVE drag done from=${fromIdx} over=${overIdx}`);
        cleanup();
        if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
          const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
          dbg('TD', 'row.touchEnd', `MOVE ${fromIdx}→${destIdx}`);
          if (destIdx !== fromIdx) onMoveRef.current(fromIdx, destIdx);
        } else {
          dbg('TD', 'row.touchEnd', 'no effective move');
        }
      } else {
        dbg('TD', 'row.touchEnd', 'NOT armed NOT active — no-op');
      }
    },
  }), [activateDrag, cleanup, updateHover]);

  // ── Handle-level instant drag (legacy) ──
  const handleTouchStart = useCallback((idx, e) => {
    dbg('TD', 'handle.touchStart', `idx=${idx}`);
    e.stopPropagation();
    e.preventDefault();
    const row = e.currentTarget.closest('[data-drag-idx]');
    activateDrag(idx, row);
  }, [activateDrag]);

  // ── Global touchmove/touchend ──
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
      dbg('TD', 'doc.touchEnd', `from=${s.fromIdx} over=${s.overIdx}`);
      const { fromIdx, overIdx } = s;
      cleanup();
      if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
        const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
        dbg('TD', 'doc.touchEnd', `MOVE ${fromIdx}→${destIdx}`);
        if (destIdx !== fromIdx) onMoveRef.current(fromIdx, destIdx);
      }
    };

    document.addEventListener('touchmove', onDocTouchMove, { passive: false });
    document.addEventListener('touchend', onDocTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onDocTouchMove);
      document.removeEventListener('touchend', onDocTouchEnd);
    };
  }, [cleanup, updateHover]);

  const isDragging = useCallback(() => {
    const s = stateRef.current;
    const result = s.active || s.armed;
    dbg('TD', 'isDragging?', `active=${s.active} armed=${s.armed} → ${result}`);
    return result;
  }, []);

  return { handleTouchStart, rowTouchHandlers, isDragging };
}
