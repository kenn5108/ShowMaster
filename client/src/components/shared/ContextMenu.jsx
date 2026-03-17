import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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

    // Detect mobile transport bar (position: fixed at bottom)
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

    // Clamp bottom: menu must not be hidden behind mobile transport bar
    const maxBottom = vh - bottomInset - 8;
    if (finalY + rect.height > maxBottom) {
      // Try placing above the touch point
      const above = y - rect.height;
      finalY = above >= 8 ? above : maxBottom - rect.height;
    }
    // Clamp top edge
    if (finalY < 8) finalY = 8;

    setPos({ left: finalX, top: finalY });
  }, [x, y]);

  // Portal to document.body — escapes any parent with transform/overflow
  // that would break position:fixed (e.g. mobile sidebar)
  return createPortal(
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
    </div>,
    document.body
  );
}
