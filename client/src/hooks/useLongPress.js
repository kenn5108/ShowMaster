import { useCallback, useRef } from 'react';

/**
 * Hook for detecting short press (tap/click) vs long press (touch hold / right-click).
 *
 * Returns event handlers for BOTH desktop (onClick, onContextMenu)
 * and mobile (onTouchStart, onTouchEnd, onTouchMove, onContextMenu).
 */

// ── TRACE HELPER ──
const _lp = (ctx, ...args) => console.log(`[LP][${ctx}]`, ...args);

export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const touchUsed = useRef(false);
  const touchMoved = useRef(false);

  // ── Touch events (mobile) ──

  const onTouchStart = useCallback((e) => {
    _lp('touchStart', `delay=${delay} setting timer`);
    touchUsed.current = true;
    isLongPress.current = false;
    touchMoved.current = false;
    timerRef.current = setTimeout(() => {
      _lp('timer', `FIRED after ${delay}ms — calling onLongPress`);
      isLongPress.current = true;
      window.getSelection()?.removeAllRanges();
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    _lp('touchEnd', `isLongPress=${isLongPress.current} touchMoved=${touchMoved.current} timerPending=${!!timerRef.current}`);
    if (timerRef.current) {
      _lp('touchEnd', 'clearing pending timer');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current && !touchMoved.current) {
      _lp('touchEnd', 'NOT longPress, NOT moved → firing shortPress + preventDefault');
      e.preventDefault();
      onShortPress?.(e);
    } else {
      _lp('touchEnd', `SKIP shortPress (isLongPress=${isLongPress.current} touchMoved=${touchMoved.current})`);
    }
    setTimeout(() => { touchUsed.current = false; }, 400);
  }, [onShortPress]);

  const onTouchMove = useCallback(() => {
    _lp('touchMove', `touchMoved was ${touchMoved.current}, timerPending=${!!timerRef.current}`);
    touchMoved.current = true;
    if (timerRef.current) {
      _lp('touchMove', 'CLEARING long press timer (finger moved)');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Mouse events (desktop) ──

  const onClick = useCallback((e) => {
    if (touchUsed.current) {
      _lp('onClick', 'SKIP (touchUsed guard)');
      return;
    }
    _lp('onClick', 'firing shortPress (desktop click)');
    onShortPress?.(e);
  }, [onShortPress]);

  const onContextMenu = useCallback((e) => {
    _lp('contextMenu', `FIRED — preventDefault + calling onLongPress. timerPending=${!!timerRef.current}`);
    e.preventDefault();
    isLongPress.current = true;
    if (timerRef.current) {
      _lp('contextMenu', 'clearing pending timer');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    window.getSelection()?.removeAllRanges();
    onLongPress?.(e);
  }, [onLongPress]);

  // External cancel: abort any pending long press (used by drag coordination)
  const cancel = useCallback(() => {
    _lp('cancel', `CALLED — timerPending=${!!timerRef.current} touchMoved=${touchMoved.current}`);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    touchMoved.current = true; // prevent shortPress on touchEnd
  }, []);

  return {
    onClick,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onContextMenu,
    cancel,
  };
}
