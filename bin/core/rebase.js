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
  getWorktreeBranches,
  addWorktree,
  removeWorktree,
  resetHardInDir,
  cherryPickInDir,
  cherryPickSkipInDir,
  getStatusInDir,
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

  // If the branch is locked by a worktree, operate in a temporary worktree
  // instead of checking out locally — preserving the existing worktree.
  const lockedBranches = getWorktreeBranches();
  if (lockedBranches.has(branch)) {
    return rebaseBranchViaWorktree(branch, onto, commitHashes);
  }

  // Normal path: checkout and reset
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
 * Rebase via a temporary worktree when the branch is locked by an existing worktree.
 */
function rebaseBranchViaWorktree(branch, onto, commitHashes) {
  const tmpDir = addWorktree(branch);
  try {
    resetHardInDir(onto, tmpDir);

    for (const commitHash of commitHashes) {
      try {
        cherryPickInDir(commitHash, tmpDir);
        log(`   ✅ Cherry-picked ${commitHash}`, COLORS.green);
      } catch (error) {
        const status = getStatusInDir(tmpDir);
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
        const skipStatus = getStatusInDir(tmpDir);
        if (skipStatus.trim() === "" || !skipStatus.includes("U")) {
          cherryPickSkipInDir(tmpDir);
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
  } finally {
    removeWorktree(tmpDir);
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
