import { useRef, useCallback, useEffect } from 'react';

/**
 * useTouchDrag — touch-based drag & drop for reorderable lists.
 *
 * HTML5 drag & drop does NOT work on mobile/touch devices.
 * This hook provides a full touch-based alternative.
 *
 * Usage:
 *   const touchDrag = useTouchDrag((fromIdx, toIdx) => { ... });
 *
 *   // On each draggable row/container:
 *   <div data-drag-idx={idx} ...>
 *
 *   // On the drag handle inside:
 *   <span onTouchStart={(e) => touchDrag.handleTouchStart(idx, e)}>⠿</span>
 *
 * The hook:
 *  - Calls e.stopPropagation() to prevent parent touch handlers (useLongPress)
 *  - Calls e.preventDefault() to prevent text selection and scrolling
 *  - Uses document.elementFromPoint() to detect hover target during drag
 *  - Applies CSS classes for visual feedback: .touch-dragging, .touch-drag-over
 *  - Fires onMove(fromIdx, toIdx) on drop
 */
export function useTouchDrag(onMove) {
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const stateRef = useRef({
    active: false,
    fromIdx: null,
    overIdx: null,
    fromEl: null,
    overEl: null,
  });

  const handleTouchStart = useCallback((idx, e) => {
    // Stop propagation: prevents useLongPress on parent row from firing
    e.stopPropagation();
    // Prevent default: stops text selection and scroll during drag
    e.preventDefault();

    const row = e.currentTarget.closest('[data-drag-idx]');
    stateRef.current = {
      active: true,
      fromIdx: idx,
      overIdx: idx,
      fromEl: row,
      overEl: null,
    };
    if (row) row.classList.add('touch-dragging');
  }, []);

  useEffect(() => {
    const onTouchMove = (e) => {
      const s = stateRef.current;
      if (!s.active) return;
      e.preventDefault();

      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const row = target?.closest('[data-drag-idx]');

      // Remove previous hover highlight
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

    const onTouchEnd = () => {
      const s = stateRef.current;
      if (!s.active) return;

      // Cleanup visual state
      if (s.fromEl) s.fromEl.classList.remove('touch-dragging');
      if (s.overEl) s.overEl.classList.remove('touch-drag-over');

      const { fromIdx, overIdx } = s;
      stateRef.current = { active: false, fromIdx: null, overIdx: null, fromEl: null, overEl: null };

      if (fromIdx !== null && overIdx !== null && fromIdx !== overIdx) {
        onMoveRef.current(fromIdx, overIdx);
      }
    };

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // mount-only, uses refs for callbacks

  return { handleTouchStart };
}
