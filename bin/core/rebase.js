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
  updateBranchToWorktreeHead,
} = require("../utils/git");
const { log, COLORS } = require("../utils/colors");

/**
 * Cherry-pick a list of commits in order, handling empty/skippable commits.
 * @param {string[]} commitHashes - oldest-first
 * @param {string} onto - target branch name for error messages
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
      // Empty commit (already applied) — skip it
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

/**
 * Rebase a single branch onto a target.
 * If the branch is locked by an existing worktree, operates via a temp worktree.
 */
function rebaseBranch(branch, onto) {
  log(`\n📦 Rebasing ${branch} onto ${onto}...`, COLORS.cyan);

  const commitHashes = getBranchOwnCommits(branch, onto);

  if (commitHashes.length === 0) {
    log("   ⏭️  No unique commits found, skipping", COLORS.yellow);
    return true;
  }

  // Oldest-first for cherry-picking
  commitHashes.reverse();

  log(`   Commits to cherry-pick: ${commitHashes.join(", ")}`, COLORS.dim);

  const lockedBranches = getWorktreeBranches();
  if (lockedBranches.has(branch)) {
    // Branch is checked out in an existing worktree. Rebase via a temp detached
    // worktree so that checkout is not disrupted. The existing worktree will
    // diverge from the updated branch ref — run `git reset --hard origin/<branch>`
    // there to sync it after this script completes.
    log(
      "   ℹ️  Branch is open in a worktree - rebasing without disrupting it",
      COLORS.dim
    );
    const tmpDir = addWorktree(branch);
    try {
      resetHard(onto, tmpDir);
      cherryPickAll(commitHashes, onto, tmpDir);
      // Detached worktree: commits are on anonymous HEAD, not the branch ref.
      // Update the branch ref before removing the worktree.
      updateBranchToWorktreeHead(branch, tmpDir);
    } finally {
      removeWorktree(tmpDir);
    }
  } else {
    checkoutBranch(branch);
    resetHard(onto);
    cherryPickAll(commitHashes, onto);
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
