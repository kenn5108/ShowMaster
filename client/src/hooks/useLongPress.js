import { useCallback, useRef } from 'react';

/**
 * Hook for detecting short press (tap/click) vs long press (touch hold / right-click).
 */
export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const touchUsed = useRef(false);
  const touchMoved = useRef(false);

  const onTouchStart = useCallback((e) => {
    touchUsed.current = true;
    isLongPress.current = false;
    touchMoved.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      window.getSelection()?.removeAllRanges();
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current && !touchMoved.current) {
      e.preventDefault();
      onShortPress?.(e);
    }
    setTimeout(() => { touchUsed.current = false; }, 400);
  }, [onShortPress]);

  const onTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onClick = useCallback((e) => {
    if (touchUsed.current) return;
    onShortPress?.(e);
  }, [onShortPress]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
    isLongPress.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    window.getSelection()?.removeAllRanges();
    onLongPress?.(e);
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    touchMoved.current = true;
  }, []);

  return { onClick, onTouchStart, onTouchEnd, onTouchMove, onContextMenu, cancel };
}
