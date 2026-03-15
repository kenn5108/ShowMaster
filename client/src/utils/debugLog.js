/**
 * debugLog — temporary remote logger for touch event tracing.
 *
 * Sends log messages to POST /api/debug so they appear in the Pi terminal.
 * Uses fetch + buffering (80ms) to avoid blocking touch event handlers.
 *
 * Usage:  import { dbg } from '../utils/debugLog';
 *         dbg('TD', 'touchStart', `idx=${idx} armed=${s.armed}`);
 *
 * Output in terminal:  >>> [DBG] 123.4ms [TD][touchStart] idx=0 armed=false
 *
 * Remove this file and all imports when debugging is done.
 */

const _buffer = [];
let _timer = null;

function _flush() {
  _timer = null;
  if (_buffer.length === 0) return;
  const batch = _buffer.splice(0);
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/debug', true); // async
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(batch));
  } catch {
    // silently discard on error
  }
}

/**
 * @param {string} prefix  e.g. 'TD', 'LP', 'PL', 'QP', 'QV', 'MQ', 'CL'
 * @param {string} ctx     e.g. 'touchStart', 'armTimer', 'cleanup'
 * @param {string} detail  free-form detail string
 */
export function dbg(prefix, ctx, detail) {
  const ts = performance.now().toFixed(1);
  const msg = `${ts}ms [${prefix}][${ctx}] ${detail}`;
  _buffer.push(msg);
  if (!_timer) {
    _timer = setTimeout(_flush, 80);
  }
}

/**
 * Dump remaining CSS drag classes in the DOM.
 */
export function dbgDumpClasses(prefix, label) {
  const armed = document.querySelectorAll('.touch-drag-armed').length;
  const dragging = document.querySelectorAll('.touch-dragging').length;
  const over = document.querySelectorAll('.touch-drag-over').length;
  const overAbove = document.querySelectorAll('.touch-drag-over-above').length;
  if (armed || dragging || over || overAbove) {
    dbg(prefix, label, `CSS in DOM → armed:${armed} dragging:${dragging} over:${over} overAbove:${overAbove}`);
  } else {
    dbg(prefix, label, 'CSS in DOM → CLEAN');
  }
}

// ── Startup confirmation ──
dbg('SYS', 'init', 'debugLog module loaded — remote logging active');
