import { useCallback, useRef } from 'react';
import { dbg } from '../utils/debugLog';

/**
 * Hook for detecting short press (tap/click) vs long press (touch hold / right-click).
 */
export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const touchUsed = useRef(false);
  const touchMoved = useRef(false);

  const onTouchStart = useCallback((e) => {
    dbg('LP', 'touchStart', `delay=${delay} — setting timer`);
    touchUsed.current = true;
    isLongPress.current = false;
    touchMoved.current = false;
    timerRef.current = setTimeout(() => {
      dbg('LP', 'timer', `FIRED after ${delay}ms — calling onLongPress`);
      isLongPress.current = true;
      window.getSelection()?.removeAllRanges();
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    dbg('LP', 'touchEnd', `isLongPress=${isLongPress.current} touchMoved=${touchMoved.current} timerPending=${!!timerRef.current}`);
    if (timerRef.current) {
      dbg('LP', 'touchEnd', 'clearing pending timer');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current && !touchMoved.current) {
      dbg('LP', 'touchEnd', 'NOT longPress NOT moved → shortPress + preventDefault');
      e.preventDefault();
      onShortPress?.(e);
    } else {
      dbg('LP', 'touchEnd', `SKIP shortPress (isLP=${isLongPress.current} moved=${touchMoved.current})`);
    }
    setTimeout(() => { touchUsed.current = false; }, 400);
  }, [onShortPress]);

  const onTouchMove = useCallback(() => {
    dbg('LP', 'touchMove', `wasMoved=${touchMoved.current} timerPending=${!!timerRef.current}`);
    touchMoved.current = true;
    if (timerRef.current) {
      dbg('LP', 'touchMove', 'CLEARING timer (finger moved)');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onClick = useCallback((e) => {
    if (touchUsed.current) {
      dbg('LP', 'onClick', 'SKIP (touchUsed guard)');
      return;
    }
    dbg('LP', 'onClick', 'desktop click → shortPress');
    onShortPress?.(e);
  }, [onShortPress]);

  const onContextMenu = useCallback((e) => {
    dbg('LP', 'contextMenu', `FIRED — timerPending=${!!timerRef.current}`);
    e.preventDefault();
    isLongPress.current = true;
    if (timerRef.current) {
      dbg('LP', 'contextMenu', 'clearing pending timer');
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    window.getSelection()?.removeAllRanges();
    dbg('LP', 'contextMenu', 'calling onLongPress');
    onLongPress?.(e);
  }, [onLongPress]);

  const cancel = useCallback(() => {
    dbg('LP', 'cancel', `CALLED — timerPending=${!!timerRef.current} touchMoved=${touchMoved.current}`);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    touchMoved.current = true;
  }, []);

  return { onClick, onTouchStart, onTouchEnd, onTouchMove, onContextMenu, cancel };
}
