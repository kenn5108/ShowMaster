/**
 * Plugin event bus — central EventEmitter for plugin hooks.
 *
 * Core services emit events here. Plugins listen.
 * If no plugin is loaded, this emitter has zero listeners and costs nothing.
 *
 * Events emitted by core:
 *   queue:changed        (queue)           — queue was modified (add, remove, move, clear, load)
 *   queue:item-added     ({ item, queue }) — single item added to queue
 *   playback:song-start  ({ song, queueItem }) — a song started playing
 *   playback:song-end    ({ song, queueItem, playedMs }) — a song finished
 *   playback:state       ({ playerState, positionMs, durationMs }) — poll tick (every 500ms)
 *   session:opened       (session)         — session opened
 *   session:closed       ()                — session closed
 */
const { EventEmitter } = require('events');

const pluginEvents = new EventEmitter();

// Don't warn on many listeners (plugins may register several each)
pluginEvents.setMaxListeners(50);

module.exports = pluginEvents;
