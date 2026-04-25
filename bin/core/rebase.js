/**
 * Core rebase logic
 */

const {
  getBranchOwnCommits,
  checkoutBranch,
  resetHard,
  cherryPick,
  cherryPickSkip,
  getStatus,
  hasConflict,
  pushBranch,
} = require("../utils/git");
const { log, COLORS } = require("../utils/colors");

/**
 * Rebase a single branch onto a target
 */
function rebaseBranch(branch, onto) {
  log(`\n📦 Rebasing ${branch} onto ${onto}...`, COLORS.cyan);

  // Get the commit hashes before we switch
  const commitHashes = getBranchOwnCommits(branch, onto);

  if (commitHashes.length === 0) {
    log("   ⏭️  No unique commits found, skipping", COLORS.yellow);
    return true;
  }

  // Reverse to oldest-first order for cherry-picking
  commitHashes.reverse();

  log(`   Commits to cherry-pick: ${commitHashes.join(", ")}`, COLORS.dim);

  // Checkout and reset
  checkoutBranch(branch);
  resetHard(onto);

  // Cherry-pick all commits in order (oldest first)
  for (const commitHash of commitHashes) {
    try {
      cherryPick(commitHash);
      log(`   ✅ Cherry-picked ${commitHash}`, COLORS.green);
    } catch (error) {
      // Check if there's a conflict
      const status = getStatus();
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
      // Check if cherry-pick is actually in progress (empty commit case)
      const skipStatus = getStatus();
      if (skipStatus.trim() === "" || !skipStatus.includes("U")) {
        cherryPickSkip();
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

  return true;
}

/**
 * Push a rebased branch
 */
function pushRebasedBranch(branch) {
  log("   🚀 Force pushing...", COLORS.blue);
  pushBranch(branch);
  log("   ✅ Pushed", COLORS.green);
}

module.exports = {
  rebaseBranch,
  pushRebasedBranch,
};
