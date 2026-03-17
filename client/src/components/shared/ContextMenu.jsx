import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Close on outside click/touch
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [onClose]);

  // After first paint, measure and clamp to visible area
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Bottom safe zone: mobile transport bar + safe-area-inset-bottom
    // On desktop/tablet this CSS var resolves to the desktop transport height,
    // but since the transport is in the normal flow there, the viewport bottom
    // is already above it.  On mobile the fixed bar sits on top of the viewport.
    const mobileBar = getComputedStyle(document.documentElement);
    const barH = parseFloat(mobileBar.getPropertyValue('--mobile-transport-height')) || 0;
    // On mobile the bar is visible (display:flex); on desktop it's display:none.
    const mobileTransport = document.querySelector('.mobile-transport');
    const bottomInset = mobileTransport && getComputedStyle(mobileTransport).display !== 'none'
      ? mobileTransport.getBoundingClientRect().height
      : 0;

    let finalX = x;
    let finalY = y;

    // Clamp right edge
    if (finalX + rect.width > vw - 8) {
      finalX = vw - rect.width - 8;
    }
    // Clamp left edge
    if (finalX < 8) finalX = 8;

    // Clamp bottom: if menu would be clipped by mobile transport bar (or viewport edge)
    const maxBottom = vh - bottomInset - 8;
    if (finalY + rect.height > maxBottom) {
      // Try placing above the touch point instead
      const above = y - rect.height;
      finalY = above >= 8 ? above : maxBottom - rect.height;
    }
    // Clamp top edge
    if (finalY < 8) finalY = 8;

    if (finalX !== x || finalY !== y) {
      setPos({ left: finalX, top: finalY });
    }
  }, [x, y]);

  return (
    <div ref={ref} className="context-menu" style={pos}>
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="context-menu-separator" />;
        }
        return (
          <button
            key={i}
            className="context-menu-item"
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
