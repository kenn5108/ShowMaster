const { Router } = require('express');
const settingsService = require('../services/settings');
const rocketshow = require('../services/rocketshow');
const { getState, updateState } = require('../core/state');

const router = Router();

// ── Stage message auto-expiration (5 minutes) ──
const STAGE_MSG_TTL_MS = 5 * 60 * 1000;
let stageMessageTimer = null;

function clearStageMessageTimer() {
  if (stageMessageTimer) { clearTimeout(stageMessageTimer); stageMessageTimer = null; }
}

function broadcastStageMessage(io, msg) {
  updateState({ stageMessage: msg });
  io.emit('state:update', { stageMessage: msg });
}

router.get('/', (req, res) => {
  res.json(settingsService.getAll());
});

router.patch('/', (req, res) => {
  settingsService.setMany(req.body);

  // If RS settings changed, restart poller
  if (req.body.rocketshow_host || req.body.rocketshow_port || req.body.polling_interval_ms) {
    rocketshow.restart();
  }

  // Live lock
  if (req.body.live_lock !== undefined) {
    updateState({ liveLock: req.body.live_lock === '1' || req.body.live_lock === true });
    req.app.get('io').emit('state:update', { liveLock: getState().liveLock });
  }

  // Stage message — with auto-expiration
  if (req.body.stage_message !== undefined) {
    const io = req.app.get('io');
    clearStageMessageTimer();
    broadcastStageMessage(io, req.body.stage_message);

    // Start expiration timer if message is non-empty
    if (req.body.stage_message) {
      stageMessageTimer = setTimeout(() => {
        stageMessageTimer = null;
        settingsService.setMany({ stage_message: '' });
        broadcastStageMessage(io, '');
        console.log('[StageMessage] Auto-expired after 5 minutes');
      }, STAGE_MSG_TTL_MS);
    }
  }

  res.json(settingsService.getAll());
});

module.exports = router;
