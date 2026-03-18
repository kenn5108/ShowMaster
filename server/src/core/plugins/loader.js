/**
 * Plugin loader — scans the plugins/ directory and initializes each plugin.
 *
 * Each plugin is a directory under PROJECT_ROOT/plugins/ containing an index.js
 * that exports: { name: string, version: string, init: (api) => void|Promise }
 *
 * Loading is fully defensive:
 * - Missing plugins/ directory → silent skip
 * - Empty plugins/ directory → silent skip
 * - Plugin without index.js → skip with warning
 * - Plugin init() throws → log error, continue loading others
 * - ShowMaster works identically with zero plugins
 */
const fs = require('fs');
const path = require('path');
const logger = require('../logger');
const { createPluginAPI } = require('./api');

const PLUGINS_DIR = path.resolve(__dirname, '../../../../plugins');
const loaded = [];

async function loadPlugins() {
  // No plugins directory → nothing to do
  if (!fs.existsSync(PLUGINS_DIR)) {
    logger.info('plugins', 'No plugins/ directory — skipping');
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
  } catch (err) {
    logger.warn('plugins', `Cannot read plugins/ directory: ${err.message}`);
    return;
  }

  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'));
  if (dirs.length === 0) {
    logger.info('plugins', 'No plugins found');
    return;
  }

  logger.info('plugins', `Found ${dirs.length} plugin(s): ${dirs.map(d => d.name).join(', ')}`);

  for (const dir of dirs) {
    const pluginPath = path.join(PLUGINS_DIR, dir.name);
    const indexPath = path.join(pluginPath, 'index.js');

    // Check for index.js
    if (!fs.existsSync(indexPath)) {
      logger.warn('plugins', `Plugin "${dir.name}": no index.js found — skipping`);
      continue;
    }

    try {
      // Load the plugin module
      const plugin = require(indexPath);

      if (typeof plugin.init !== 'function') {
        logger.warn('plugins', `Plugin "${dir.name}": no init() function exported — skipping`);
        continue;
      }

      const pluginName = plugin.name || dir.name;
      const pluginVersion = plugin.version || '0.0.0';

      // Create namespaced API for this plugin
      const api = createPluginAPI(pluginName);

      // Initialize (may be async)
      logger.info('plugins', `Loading "${pluginName}" v${pluginVersion}...`);
      await plugin.init(api);

      loaded.push({ name: pluginName, version: pluginVersion, path: pluginPath });
      logger.info('plugins', `  ✓ "${pluginName}" loaded`);
    } catch (err) {
      // Plugin crashed → log and continue
      logger.error('plugins', `Plugin "${dir.name}" failed to load: ${err.message}`);
      logger.error('plugins', err.stack || '');
    }
  }

  if (loaded.length > 0) {
    logger.info('plugins', `${loaded.length} plugin(s) active`);
  }
}

function getLoadedPlugins() {
  return [...loaded];
}

module.exports = { loadPlugins, getLoadedPlugins };
