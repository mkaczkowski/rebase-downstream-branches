/**
 * Core rebase logic for rebase-stack.
 *
 * Unlike rebase.js which computes own commits at rebase time (via git log target..branch),
 * this module accepts pre-captured commit hashes. This is critical for stack rebasing:
 * once the first branch is rebased, its commit hashes change, which would cause
 * git log to return incorrect results for downstream branches.
 */

const {
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

/**
 * Rebase a branch onto a target using pre-captured commit hashes.
 * @param {string} branch - the branch to rebase
 * @param {string} onto - the target branch to rebase onto
 * @param {string[]} commitHashes - oldest-first commit hashes (captured before any rebasing)
 */
function rebaseFromCommits(branch, onto, commitHashes) {
  log(`\n📦 Rebasing ${branch} onto ${onto}...`, COLORS.cyan);

  if (commitHashes.length === 0) {
    log("   ⏭️  No own commits, fast-forwarding to target", COLORS.yellow);
    // Still need to update the branch ref to point to the rebased parent
    const lockedBranches = getWorktreeBranches();
    if (lockedBranches.has(branch)) {
      const tmpDir = addWorktree(branch);
      try {
        resetHard(onto, tmpDir);
        updateBranchToWorktreeHead(branch, tmpDir);
      } finally {
        removeWorktree(tmpDir);
      }
    } else {
      checkoutBranch(branch);
      resetHard(onto);
    }
    return;
  }

  log(`   Commits to cherry-pick: ${commitHashes.join(", ")}`, COLORS.dim);

  const lockedBranches = getWorktreeBranches();
  if (lockedBranches.has(branch)) {
    log(
      "   ℹ️  Branch is open in a worktree - rebasing without disrupting it",
      COLORS.dim
    );
    const tmpDir = addWorktree(branch);
    try {
      resetHard(onto, tmpDir);
      cherryPickAll(commitHashes, onto, tmpDir);
      updateBranchToWorktreeHead(branch, tmpDir);
    } finally {
      removeWorktree(tmpDir);
    }
  } else {
    checkoutBranch(branch);
    resetHard(onto);
    cherryPickAll(commitHashes, onto);
  }
}

function pushRebasedBranch(branch) {
  log("   🚀 Force pushing...", COLORS.blue);
  pushBranch(branch);
  log("   ✅ Pushed", COLORS.green);
}

module.exports = {
  rebaseFromCommits,
  pushRebasedBranch,
};
