import { useRef, useCallback, useEffect } from 'react';

/**
 * useTouchDrag — touch-based drag & drop for reorderable lists.
 *
 * options.onTap(idx)              — called on quick tap (< ARM_DELAY)
 * options.onContextMenu(idx,x,y)  — called on release after armed without movement
 */

const ARM_DELAY = 300;
const MOVE_THRESHOLD = 10;

export function useTouchDrag(onMove, options = {}) {
  const { onTap, onContextMenu } = options;

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;
  const onContextMenuRef = useRef(onContextMenu);
  onContextMenuRef.current = onContextMenu;

  const stateRef = useRef({
    armTimer: null, armed: false,
    startX: 0, startY: 0, startIdx: null, startRow: null,
    active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
    touchInProgress: false,
    listEl: null,
  });

  // Deferred passes only remove INDICATOR classes (touch-drag-over*),
  // never armed/dragging — those belong to whichever drag is currently active.
  const removeIndicatorClasses = () => {
    document.querySelectorAll('.touch-drag-over, .touch-drag-over-above')
      .forEach(el => el.classList.remove('touch-drag-over', 'touch-drag-over-above'));
  };

  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (s.armTimer) { clearTimeout(s.armTimer); s.armTimer = null; }
    if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
    if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }

    const savedListEl = s.listEl;

    document.querySelectorAll('.touch-drag-armed, .touch-dragging, .touch-drag-over, .touch-drag-over-above')
      .forEach(el => el.classList.remove('touch-drag-armed', 'touch-dragging', 'touch-drag-over', 'touch-drag-over-above'));

    Object.assign(s, {
      armTimer: null, armed: false,
      startX: 0, startY: 0, startIdx: null, startRow: null,
      active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null,
      touchInProgress: false, listEl: null,
    });

    if (savedListEl) {
      savedListEl.style.willChange = 'transform';
      // eslint-disable-next-line no-unused-expressions
      savedListEl.offsetHeight;
      savedListEl.style.willChange = '';
    }

    requestAnimationFrame(removeIndicatorClasses);
    setTimeout(removeIndicatorClasses, 150);
  }, []);

  const updateHover = useCallback((touchX, touchY, s) => {
    const target = document.elementFromPoint(touchX, touchY);
    const row = target?.closest('[data-drag-idx]');

    if (s.overEl) {
      s.overEl.classList.remove('touch-drag-over');
      s.overEl.classList.remove('touch-drag-over-above');
    }

    if (row && s.listEl && s.listEl.contains(row)) {
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
    } else if (s.listEl && target && s.listEl.contains(target)) {
      const count = parseInt(s.listEl.dataset.dragList, 10);
      if (!isNaN(count) && count > 0) {
        const lastRow = s.listEl.querySelector(`[data-drag-idx="${count - 1}"]`);
        if (lastRow) {
          s.overIdx = count;
          s.overEl = lastRow;
          if (s.fromIdx !== count - 1) lastRow.classList.add('touch-drag-over');
        }
      }
    }
  }, []);

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

  const rowTouchHandlers = useCallback((idx) => ({
    onTouchStart: (e) => {
      const s = stateRef.current;

      if (s.active || s.armed) {
        cleanup();
      }

      const touch = e.touches[0];
      const row = e.currentTarget.closest('[data-drag-idx]');

      s.touchInProgress = true;
      s.startX = touch.clientX;
      s.startY = touch.clientY;
      s.startIdx = idx;
      s.startRow = row;
      s.listEl = row?.closest('[data-drag-list]') || null;
      s.armed = false;

      s.armTimer = setTimeout(() => {
        s.armTimer = null;
        s.armed = true;
        if (row) row.classList.add('touch-drag-armed');
      }, ARM_DELAY);
    },

    onTouchMove: (e) => {
      const s = stateRef.current;

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

      if (s.armed && !s.active) {
        e.preventDefault();
        activateDrag(s.startIdx, s.startRow);
      }

      if (s.active) {
        e.preventDefault();
        const touch = e.touches[0];
        updateHover(touch.clientX, touch.clientY, s);
      }
    },

    onTouchEnd: () => {
      const s = stateRef.current;

      // Tap: arm timer still pending (< 300ms)
      if (s.armTimer) {
        clearTimeout(s.armTimer);
        s.armTimer = null;
        const savedIdx = s.startIdx;
        s.startIdx = null;
        s.startRow = null;
        s.touchInProgress = false;
        if (onTapRef.current && savedIdx !== null) {
          onTapRef.current(savedIdx);
        }
        return;
      }

      // Armed but no drag → context menu immediately on release
      if (s.armed && !s.active) {
        const savedIdx = s.startIdx;
        const savedX = s.startX;
        const savedY = s.startY;
        if (s.startRow) s.startRow.classList.remove('touch-drag-armed');
        s.armed = false;
        s.startIdx = null;
        s.startRow = null;
        s.touchInProgress = false;
        if (onContextMenuRef.current && savedIdx !== null) {
          onContextMenuRef.current(savedIdx, savedX, savedY);
        }
        return;
      }

      // Active drag → finish
      if (s.active) {
        const { fromIdx, overIdx } = s;
        cleanup();
        if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx && overIdx !== fromIdx + 1) {
          const destIdx = overIdx > fromIdx ? overIdx - 1 : overIdx;
          if (destIdx !== fromIdx) onMoveRef.current(fromIdx, destIdx);
        }
      }
    },
  }), [activateDrag, cleanup, updateHover]);

  const handleTouchStart = useCallback((idx, e) => {
    e.stopPropagation();
    e.preventDefault();
    const row = e.currentTarget.closest('[data-drag-idx]');
    const s = stateRef.current;
    s.listEl = row?.closest('[data-drag-list]') || null;
    activateDrag(idx, row);
  }, [activateDrag]);

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
    return s.active || s.armed;
  }, []);

  const isTouching = useCallback(() => stateRef.current.touchInProgress, []);

  return { handleTouchStart, rowTouchHandlers, isDragging, isTouching };
}
