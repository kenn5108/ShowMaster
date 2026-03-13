import { useCallback, useRef } from 'react';

/**
 * Hook for detecting short press (tap/click) vs long press (touch hold / right-click).
 *
 * Returns event handlers for BOTH desktop (onClick, onContextMenu)
 * and mobile (onTouchStart, onTouchEnd, onTouchMove, onContextMenu).
 *
 * Fixes:
 *  - Prevents double-fire on mobile (touch + click both fire)
 *  - Clears text selection before opening long-press menu
 *  - Tracks touchMove to prevent short press after finger movement (scroll)
 *  - Text selection prevention is via CSS (user-select: none on rows),
 *    NOT via preventDefault on touchStart (which would kill scrolling)
 */
export function useLongPress(onShortPress, onLongPress, delay = 500) {
  const timerRef = useRef(null);
  const isLongPress = useRef(false);
  const touchUsed = useRef(false);
  const touchMoved = useRef(false);

  // ── Touch events (mobile) ──

  const onTouchStart = useCallback((e) => {
    touchUsed.current = true;
    isLongPress.current = false;
    touchMoved.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      // Clear any accidental text selection before showing context menu
      window.getSelection()?.removeAllRanges();
      onLongPress?.(e);
    }, delay);
  }, [onLongPress, delay]);

  const onTouchEnd = useCallback((e) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Only fire short press if: not a long press AND finger didn't move
    if (!isLongPress.current && !touchMoved.current) {
      onShortPress?.(e);
    }
    // Reset touchUsed after a small delay so the subsequent click event is ignored
    setTimeout(() => { touchUsed.current = false; }, 300);
  }, [onShortPress]);

  const onTouchMove = useCallback(() => {
    // Finger moved — cancel long press timer AND mark as moved
    // so touchEnd won't fire shortPress (prevents tap-after-scroll)
    touchMoved.current = true;
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
