const path = require('path');

const config = {
  port: parseInt(process.env.SM_PORT || '3000', 10),
  host: process.env.SM_HOST || '0.0.0.0',
  dataDir: path.resolve(__dirname, '../../../data'),
  clientDist: path.resolve(__dirname, '../../../client/dist'),

  // Defaults — overridden by DB settings at runtime
  rocketshow: {
    host: process.env.RS_HOST || '127.0.0.1',
    port: parseInt(process.env.RS_PORT || '8181', 10),
    pollingIntervalMs: 500,
  },

  // Playback
  playbackMode: 'auto', // 'auto' | 'manual'
};

module.exports = config;
