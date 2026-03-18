/**
 * Plugin API — the interface exposed to each plugin's init() function.
 *
 * Provides controlled access to ShowMaster internals.
 * Plugins receive this object and should NOT require() core modules directly.
 */
const { getState } = require('../state');
const { getDb } = require('../database');
const logger = require('../logger');
const pluginEvents = require('./events');
const settingsService = require('../../services/settings');

let _io = null;
let _app = null;
let _queue = null;

/**
 * Must be called once from index.js after io/app/services are ready.
 */
function initialize({ io, app, queue }) {
  _io = io;
  _app = app;
  _queue = queue;
}

/**
 * Build the API object for a specific plugin.
 * Each plugin gets its own namespaced logger and settings prefix.
 */
function createPluginAPI(pluginName) {
  const prefix = `plugin:${pluginName}`;

  return {
    // ── Events (read-only, listen only) ──
    events: pluginEvents,

    // ── State (read-only snapshot) ──
    getState() {
      return getState();
    },

    // ── Queue operations ──
    queue: {
      /** Get current queue */
      getQueue() {
        return getState().queue || [];
      },
      /** Add a song to the queue */
      async add(songId, position = 'bottom') {
        if (!_queue) throw new Error('Queue service not available');
        return _queue.add(songId, position);
      },
      /** Add multiple songs */
      async addBatch(songIds, position = 'bottom') {
        if (!_queue) throw new Error('Queue service not available');
        return _queue.addBatch(songIds, position);
      },
    },

    // ── Library (read-only) ──
    library: {
      /** Get all songs */
      getAll() {
        const db = getDb();
        return db.prepare('SELECT * FROM songs ORDER BY title').all();
      },
      /** Search songs by title or artist */
      search(query) {
        const db = getDb();
        const q = `%${query}%`;
        return db.prepare('SELECT * FROM songs WHERE title LIKE ? OR artist LIKE ? ORDER BY title').all(q, q);
      },
      /** Get a single song by ID */
      getById(songId) {
        const db = getDb();
        return db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
      },
    },

    // ── Settings (namespaced per plugin) ──
    settings: {
      /** Get a plugin setting */
      get(key) {
        return settingsService.get(`${prefix}:${key}`);
      },
      /** Set a plugin setting */
      set(key, value) {
        settingsService.set(`${prefix}:${key}`, String(value));
      },
      /** Get all plugin settings (strip prefix) */
      getAll() {
        const all = settingsService.getAll();
        const result = {};
        const p = `${prefix}:`;
        for (const [k, v] of Object.entries(all)) {
          if (k.startsWith(p)) {
            result[k.slice(p.length)] = v;
          }
        }
        return result;
      },
    },

    // ── HTTP routes (register plugin-specific routes) ──
    registerRoutes(mountPath, router) {
      if (!_app) throw new Error('Express app not available');
      const fullPath = `/api/plugins/${pluginName}${mountPath}`;
      _app.use(fullPath, router);
      logger.info('plugins', `  Route: ${fullPath}`);
    },

    // ── Socket.IO (emit to all clients) ──
    broadcast(event, data) {
      if (_io) _io.emit(`plugin:${pluginName}:${event}`, data);
    },

    // ── Logger (namespaced) ──
    log: {
      info: (msg) => logger.info(prefix, msg),
      warn: (msg) => logger.warn(prefix, msg),
      error: (msg) => logger.error(prefix, msg),
    },
  };
}

module.exports = { initialize, createPluginAPI };
