const { Router } = require('express');
const { exec, execSync } = require('child_process');
const path = require('path');
const logger = require('../core/logger');

const router = Router();
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const UPDATE_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'update.sh');

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
 * Runs scripts/update.sh which handles:
 *   git pull → npm install → vite build → systemctl restart
 *
 * Emits 'update:applying' so clients show the overlay and poll for server return.
 * The systemctl restart at the end kills this process — clients detect the
 * disconnect and auto-reload when the new server comes back.
 */
router.post('/apply', (req, res) => {
  const io = req.app.get('io');

  // Notify ALL connected clients that an update is being applied
  io.emit('update:applying');

  // Respond immediately so the client knows the process started
  res.json({ started: true });

  // Run the update script in background
  logger.info('update', 'Starting update pipeline...');
  exec(`bash "${UPDATE_SCRIPT}"`, { cwd: PROJECT_ROOT, timeout: 300000 }, (err, stdout, stderr) => {
    if (err) {
      // If we get here, systemctl didn't kill us — git pull or build probably failed
      logger.error('update', `Update failed: ${err.message}`);
      if (stderr) logger.error('update', stderr);
      if (stdout) logger.info('update', stdout);
      // Notify clients that the update failed
      io.emit('update:failed', { error: err.message });
    }
    // If systemctl restart succeeded, this process is dead and this code never runs
  });
});

module.exports = router;
