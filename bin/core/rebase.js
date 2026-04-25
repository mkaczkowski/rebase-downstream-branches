/**
 * Core rebase logic
 */

const {
  getBranchOwnCommits,
  checkoutBranch,
  resetHard,
  pushBranch,
  getWorktreeBranches,
  addWorktree,
  removeWorktree,
  updateBranchToWorktreeHead,
} = require("../utils/git");
const { log, COLORS } = require("../utils/colors");
const { cherryPickAll } = require("./cherry-pick");

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
