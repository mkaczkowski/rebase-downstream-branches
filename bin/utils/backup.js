/**
 * Backup creation and management utilities
 */

const { exec } = require("./git");
const { log, COLORS } = require("./colors");

/**
 * Create backup refs for branches before rebasing
 */
function createBackup(branch) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRef = `refs/backup/${branch}-${timestamp}`;

  try {
    exec(`git update-ref ${backupRef} ${branch}`, { silent: true });
    return backupRef;
  } catch (error) {
    log(`⚠️  Could not create backup for ${branch}`, COLORS.yellow);
    return null;
  }
}

module.exports = {
  createBackup,
};
