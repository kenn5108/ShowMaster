import { useCallback, useRef } from 'react';

/**
 * Hook for detecting long press (touch) vs short tap.
 * Returns event handlers for onTouchStart/End and onContextMenu.
 */
export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);

  const start = useCallback((e) => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const end = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current) {
      onShortPress?.(e);
    }
  }, [onShortPress]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const contextMenu = useCallback((e) => {
    e.preventDefault();
    onLongPress?.(e);
  }, [onLongPress]);

  return {
    onTouchStart: start,
    onTouchEnd: end,
    onTouchMove: cancel,
    onContextMenu: contextMenu,
  };
}
