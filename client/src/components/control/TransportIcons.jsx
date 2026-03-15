import React from 'react';

/**
 * TransportIcons — pure SVG transport icons.
 * Renders identically on all platforms (no emoji rendering differences).
 * Each icon is a simple inline SVG with currentColor fill/stroke.
 */

const S = { display: 'inline-block', verticalAlign: 'middle' };

export function IconStop({ size = 20 }) {
  return (
    <svg style={S} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}

export function IconPlay({ size = 20 }) {
  return (
    <svg style={S} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

export function IconPause({ size = 20 }) {
  return (
    <svg style={S} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1" />
      <rect x="14" y="4" width="5" height="16" rx="1" />
    </svg>
  );
}

export function IconNext({ size = 20 }) {
  return (
    <svg style={S} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <polygon points="4,4 16,12 4,20" />
      <rect x="17" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}
