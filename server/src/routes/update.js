const { Router } = require('express');
const { exec, execSync } = require('child_process');
const path = require('path');
const logger = require('../core/logger');

const router = Router();
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * GET /api/update/check
 * Fetch origin and compare HEAD with origin/master.
 * Returns { upToDate, currentHash, remoteHash, behindCount, summary }
 */
router.get('/check', (req, res) => {
  try {
    // Fetch latest from remote
    execSync('git fetch origin', { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000 });

    const currentHash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    const remoteHash = execSync('git rev-parse --short origin/master', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();

    // Count commits behind
    const behindStr = execSync('git rev-list HEAD..origin/master --count', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    const behindCount = parseInt(behindStr, 10) || 0;

    // Get short log of new commits (max 10)
    let summary = '';
    if (behindCount > 0) {
      summary = execSync('git log HEAD..origin/master --oneline -10', { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
    }

    res.json({
      upToDate: behindCount === 0,
      currentHash,
      remoteHash,
      behindCount,
      summary,
    });
  } catch (err) {
    logger.error('update', `Check failed: ${err.message}`);
    res.status(500).json({ error: 'Échec de la vérification des mises à jour' });
  }
});

/**
 * POST /api/update/apply
 * Pull latest code, rebuild client, restart server via pm2.
 * Emits 'update:applying' so clients know to reload on reconnect.
 */
router.post('/apply', (req, res) => {
  const io = req.app.get('io');

  // Notify ALL connected clients that an update is being applied
  io.emit('update:applying');

  // Respond immediately so the client knows the process started
  res.json({ started: true });

  // Run the update pipeline in background
  const cmd = 'cd ' + PROJECT_ROOT + ' && git pull origin master && cd client && npx vite build --mode production && cd .. && pm2 restart showmaster';

  logger.info('update', 'Starting update pipeline...');
  exec(cmd, { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) {
      // If we get here, pm2 didn't kill us — so the build probably failed
      logger.error('update', `Update failed: ${err.message}`);
      logger.error('update', stderr);
      // Notify clients that the update failed
      io.emit('update:failed', { error: err.message });
    }
    // If pm2 restart succeeded, this process is dead and this code never runs
  });
});

module.exports = router;
