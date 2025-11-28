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

  log(
    `   Commits to cherry-pick: ${commitHashes.reverse().join(", ")}`,
    COLORS.dim
  );

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
        log("   ⚠️  Conflict detected! Resolve manually:", COLORS.yellow);
        log("      1. Fix conflicts in the files", COLORS.dim);
        log("      2. git add <files>", COLORS.dim);
        log("      3. git cherry-pick --continue", COLORS.dim);
        log("      4. Re-run this script", COLORS.dim);
        process.exit(1);
      }
      // If empty commit, skip
      cherryPickSkip();
      log(
        `   ⏭️  Skipped ${commitHash} (no changes or already applied)`,
        COLORS.yellow
      );
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
