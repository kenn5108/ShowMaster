const { Router } = require('express');
const settingsService = require('../services/settings');
const rocketshow = require('../services/rocketshow');
const { getState, updateState } = require('../core/state');

const router = Router();

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

  // Stage message
  if (req.body.stage_message !== undefined) {
    updateState({ stageMessage: req.body.stage_message });
    req.app.get('io').emit('state:update', { stageMessage: req.body.stage_message });
  }

  res.json(settingsService.getAll());
});

module.exports = router;
