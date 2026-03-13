import { useCallback, useRef } from 'react';

/**
 * Hook for detecting short press (tap/click) vs long press (touch hold / right-click).
 *
 * Returns event handlers for BOTH desktop (onClick, onContextMenu)
 * and mobile (onTouchStart, onTouchEnd, onTouchMove, onContextMenu).
 *
 * Prevents double-fire on mobile (where touch + click both fire).
 */
export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const touchUsed = useRef(false);

  // ── Touch events (mobile) ──

  const onTouchStart = useCallback((e) => {
    touchUsed.current = true;
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current) {
      onShortPress?.(e);
    }
    // Reset touchUsed after a small delay so the subsequent click is ignored
    setTimeout(() => { touchUsed.current = false; }, 300);
  }, [onShortPress]);

  const onTouchMove = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ── Mouse events (desktop) ──

  const onClick = useCallback((e) => {
    // If touch was used, skip (prevents double-fire on mobile)
    if (touchUsed.current) return;
    onShortPress?.(e);
  }, [onShortPress]);

  const onContextMenu = useCallback((e) => {
    e.preventDefault();
    // Clear any pending long-press timer (touch)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onLongPress?.(e);
  }, [onLongPress]);

  return {
    onClick,
    onTouchStart,
    onTouchEnd,
    onTouchMove,
    onContextMenu,
  };
}
