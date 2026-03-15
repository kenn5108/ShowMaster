/**
 * debugLog — temporary remote logger for touch event tracing.
 *
 * Sends log messages to POST /api/debug so they appear in the Pi terminal.
 * Uses sendBeacon + buffering to avoid blocking touch event handlers.
 *
 * Usage:  import { dbg } from '../utils/debugLog';
 *         dbg('TD', 'touchStart', `idx=${idx} armed=${s.armed}`);
 *
 * Output in terminal:  [DBG] [TD][touchStart] idx=0 armed=false
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
    // sendBeacon is fire-and-forget, never blocks the main thread
    const ok = navigator.sendBeacon('/api/debug', new Blob(
      [JSON.stringify(batch)],
      { type: 'application/json' }
    ));
    // Fallback if sendBeacon fails (e.g. page unloading)
    if (!ok) {
      fetch('/api/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      }).catch(() => {});
    }
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
  // Also keep in browser console for local debugging
  console.log(msg);
  _buffer.push(msg);
  // Flush every 80ms — fast enough for real-time, batched enough for perf
  if (!_timer) {
    _timer = setTimeout(_flush, 80);
  }
}

/**
 * Dump remaining CSS drag classes in the DOM.
 * @param {string} prefix
 * @param {string} label
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
