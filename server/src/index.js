const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const { execSync } = require('child_process');
const config = require('./core/config');
const { getDb, closeDb } = require('./core/database');
const { runMigrations } = require('./migrations/run');
const { getState, onStateChange, updateState } = require('./core/state');
const logger = require('./core/logger');

// Services
const session = require('./services/session');
const rocketshow = require('./services/rocketshow');
const queue = require('./services/queue');
const playback = require('./services/playback');
const settingsService = require('./services/settings');

// Routes
const sessionRoutes = require('./routes/session');
const libraryRoutes = require('./routes/library');
const queueRoutes = require('./routes/queue');
const playbackRoutes = require('./routes/playback');
const playlistsRoutes = require('./routes/playlists');
const lyricsRoutes = require('./routes/lyrics');
const settingsRoutes = require('./routes/settings');
const historyRoutes = require('./routes/history');
const logsRoutes = require('./routes/logs');
const updateRoutes = require('./routes/update');

// ── Bootstrap ────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] },
  pingTimeout: 10000,
  pingInterval: 5000,
});

// Make io available to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/session', sessionRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/playback', playbackRoutes);
app.use('/api/playlists', playlistsRoutes);
app.use('/api/lyrics', lyricsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/update', updateRoutes);

// Full state endpoint
app.get('/api/state', (req, res) => {
  res.json(getState());
});

// NOTE: Static files + catch-all are registered AFTER plugin loading in startup()
// to ensure plugin routes (e.g. /api/plugins/jukebox/status) are reachable.

// ── Socket.IO ────────────────────────────────────────────
io.on('connection', (socket) => {
  logger.debug('socket', `Client connected: ${socket.id}`);

  // Send full state on connect
  socket.emit('state:full', getState());

  // Transport commands via socket (low latency)
  socket.on('transport:play', async (data) => {
    try {
      if (data?.queueItemId) {
        await playback.playQueueItem(data.queueItemId);
      } else {
        await playback.play();
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('transport:pause', async () => {
    try { await playback.pause(); } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('transport:stop', async () => {
    try { await playback.stop(); } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('transport:next', async () => {
    try { await playback.next(); } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('transport:seek', async (data) => {
    try { await playback.seek(data.positionMs); } catch (err) { socket.emit('error', { message: err.message }); }
  });

  // Queue commands via socket
  socket.on('queue:add', (data) => {
    try {
      const q = queue.add(data.songId, data.position || 'bottom');
      io.emit('state:update', { queue: q });
    } catch (err) { socket.emit('error', { message: err.message }); }
  });

  socket.on('disconnect', () => {
    logger.debug('socket', `Client disconnected: ${socket.id}`);
  });
});

// ── State broadcast ──────────────────────────────────────
let broadcastTimer = null;
onStateChange(() => {
  // Throttle broadcasts to avoid flooding
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    io.emit('state:update', getState());
    broadcastTimer = null;
  }, 50);
});

// ── Startup sequence ─────────────────────────────────────
async function startup() {
  logger.info('core', '=== ShowMaster V2 starting ===');

  // 1. Initialize database & run migrations
  getDb();
  runMigrations();
  logger.info('core', 'Database ready');

  // 2. Load settings into state
  const stageMessage = settingsService.get('stage_message') || '';
  const syncOffsetMs = parseInt(settingsService.get('sync_offset_ms') || '0', 10);

  // Read git version for auto-reload detection
  let serverVersion = '';
  try {
    serverVersion = execSync('git rev-parse --short HEAD', { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim();
  } catch (e) {
    logger.warn('core', 'Could not read git version');
  }

  updateState({ stageMessage, syncOffsetMs, serverVersion });

  // 3. Restore session
  session.init();

  // 4. Load queue if session active
  if (getState().session) {
    queue.load();
  }

  // 5. Init playback
  playback.init();

  // 6. Start RocketShow poller — register playback callback BEFORE starting
  rocketshow.onAfterPoll(() => playback.onPollUpdate());
  rocketshow.start();

  // 7. Load plugins (if any)
  try {
    const { initialize } = require('./core/plugins/api');
    const { loadPlugins, getLoadedPlugins } = require('./core/plugins/loader');
    initialize({ io, app, queue });
    await loadPlugins();
    // Expose loaded plugins to client via state
    updateState({ plugins: getLoadedPlugins().map(p => ({ name: p.name, version: p.version })) });
  } catch (err) {
    logger.warn('plugins', `Plugin system init failed (non-fatal): ${err.message}`);
    updateState({ plugins: [] });
  }

  // 8. Serve React client (AFTER plugin routes to avoid catch-all conflict)
  const clientDist = config.clientDist;
  app.use(express.static(clientDist, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(path.join(clientDist, 'index.html'));
  });

  // 9. Start HTTP server
  httpServer.listen(config.port, config.host, () => {
    logger.info('core', `Server listening on http://${config.host}:${config.port}`);
    logger.info('core', `Control UI: http://localhost:${config.port}/`);
    logger.info('core', `Prompter: http://localhost:${config.port}/prompter`);
  });
}

// ── Graceful shutdown ────────────────────────────────────
function shutdown() {
  logger.info('core', 'Shutting down...');
  rocketshow.stop();
  closeDb();
  httpServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Go!
startup().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
