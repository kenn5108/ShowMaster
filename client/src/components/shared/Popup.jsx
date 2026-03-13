import React from 'react';

export default function Popup({ title, actions, onClose }) {
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        {title && <div className="popup-title">{title}</div>}
        <div className="popup-actions">
          {actions.map((action, i) => (
            <button
              key={i}
              className="popup-action"
              onClick={() => {
                action.onClick();
                onClose();
              }}
            >
              {action.label}
            </button>
          ))}
          <button className="popup-action" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
