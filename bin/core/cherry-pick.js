/**
 * Shared cherry-pick logic used by both rebase.js and rebase-stack.js.
 */

const {
  cherryPick,
  cherryPickSkip,
  getStatus,
  hasConflict,
} = require("../utils/git");
const { log, COLORS } = require("../utils/colors");

/**
 * Cherry-pick a list of commits in order, handling empty/skippable commits.
 * @param {string[]} commitHashes - oldest-first
 * @param {string} onto - target branch name (for error messages)
 * @param {string|undefined} cwd - working directory (temp worktree path, or undefined for main repo)
 */
function cherryPickAll(commitHashes, onto, cwd) {
  for (const commitHash of commitHashes) {
    try {
      cherryPick(commitHash, cwd);
      log(`   ✅ Cherry-picked ${commitHash}`, COLORS.green);
    } catch (error) {
      const status = getStatus(cwd);
      if (hasConflict(status)) {
        const conflictError = new Error(
          `Conflict detected while cherry-picking ${commitHash} onto ${onto}.\n` +
            "   Resolve manually:\n" +
            "      1. Fix conflicts in the files\n" +
            "      2. git add <files>\n" +
            "      3. git cherry-pick --continue\n" +
            "      4. Re-run this script"
        );
        conflictError.isConflict = true;
        throw conflictError;
      }
      // Empty commit (already applied) -- skip it
      if (status.trim() === "" || !status.includes("U")) {
        cherryPickSkip(cwd);
        log(
          `   ⏭️  Skipped ${commitHash} (no changes or already applied)`,
          COLORS.yellow
        );
      } else {
        throw new Error(
          `Cherry-pick of ${commitHash} failed unexpectedly: ${error.message}`
        );
      }
    }
  }
}

module.exports = { cherryPickAll };
