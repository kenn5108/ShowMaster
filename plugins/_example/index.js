/**
 * Example ShowMaster Plugin — template for building plugins.
 *
 * To activate: rename this folder from "_example" to "example"
 * (directories starting with _ or . are ignored by the loader).
 *
 * A plugin must export:
 *   name    — unique identifier (string)
 *   version — semver (string)
 *   init    — function(api) called at startup
 *
 * The `api` object provides:
 *   api.events           — EventEmitter (listen to core events)
 *   api.getState()       — read-only state snapshot
 *   api.queue.getQueue() — current queue
 *   api.queue.add(songId, position) — add to queue
 *   api.library.getAll() — all songs
 *   api.library.search(query) — search songs
 *   api.library.getById(id) — single song
 *   api.settings.get(key) / set(key, value) / getAll()
 *   api.registerRoutes(path, router) — mount Express routes at /api/plugins/<name><path>
 *   api.broadcast(event, data) — emit socket event to all clients (namespaced plugin:<name>:<event>)
 *   api.log.info(msg) / warn(msg) / error(msg)
 *
 * Available events:
 *   queue:changed        (queue)
 *   queue:item-added     ({ songId, position, queue })
 *   playback:song-start  ({ song, queueItem })
 *   playback:song-end    ({ song, queueItem, playedMs })
 *   playback:state       ({ playerState, positionMs, durationMs })
 *   session:opened       (session)
 *   session:closed       ()
 */

module.exports = {
  name: 'example',
  version: '1.0.0',

  init(api) {
    api.log.info('Example plugin loaded!');

    // Listen for song starts
    api.events.on('playback:song-start', ({ song }) => {
      api.log.info(`Now playing: ${song.title} — ${song.artist}`);
    });

    // Listen for queue changes
    api.events.on('queue:changed', (queue) => {
      api.log.info(`Queue updated: ${queue.length} item(s)`);
    });

    // Example: read a setting
    const lastRun = api.settings.get('last_run');
    api.log.info(`Last run: ${lastRun || 'never'}`);
    api.settings.set('last_run', new Date().toISOString());

    // Example: register an HTTP route
    // const { Router } = require('express');
    // const router = Router();
    // router.get('/status', (req, res) => res.json({ ok: true }));
    // api.registerRoutes('', router);
    // → accessible at GET /api/plugins/example/status
  },
};
