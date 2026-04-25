/**
 * Git operations utilities
 */

const { execSync } = require("child_process");
const os = require("os");

function exec(command, options = {}) {
  try {
    return execSync(command, {
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    });
  } catch (error) {
    if (options.ignoreError) {
      return null;
    }
    throw error;
  }
}

function getCurrentBranch() {
  return exec("git rev-parse --abbrev-ref HEAD", { silent: true }).trim();
}

function getRemoteUrl() {
  try {
    return exec("git remote get-url origin", { silent: true }).trim();
  } catch {
    return null;
  }
}

/**
 * Get the last commit hash that belongs to just this branch (not inherited)
 */
function getBranchOwnCommits(branch, targetBranch) {
  try {
    // Get commits that are in this branch but not in target
    const commits = exec(`git log ${targetBranch}..${branch} --oneline`, {
      silent: true,
    }).trim();

    if (!commits) return [];

    const lines = commits.split("\n").filter(Boolean);
    // Return all commit hashes that belong to this branch
    return lines.map((line) => line.split(" ")[0]);
  } catch {
    return [];
  }
}

function fetchFromOrigin() {
  try {
    exec("git fetch origin", { silent: true });
    return true;
  } catch (error) {
    return false;
  }
}

function checkoutBranch(branch, options = {}) {
  return exec(`git checkout ${branch}`, {
    silent: true,
    ignoreError: options.ignoreError,
  });
}

function pullBranch(branch) {
  return exec(`git pull origin ${branch} --ff-only`, {
    silent: true,
    ignoreError: true,
  });
}

function resetHard(target, cwd) {
  return exec(`git reset --hard ${target}`, { silent: true, cwd });
}

function cherryPick(commitHash, cwd) {
  return exec(`git cherry-pick ${commitHash}`, { silent: true, cwd });
}

function cherryPickSkip(cwd) {
  return exec("git cherry-pick --skip", { silent: true, ignoreError: true, cwd });
}

function getStatus(cwd) {
  return exec("git status --porcelain", { silent: true, cwd }) || "";
}

function hasConflict(status) {
  return (
    status.includes("UU") || status.includes("AA") || status.includes("DD")
  );
}

function pushBranch(branch) {
  return exec(`git push origin ${branch} --force-with-lease`, { silent: true });
}

function isGitRepository() {
  try {
    exec("git rev-parse --git-dir", { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the set of branch names currently checked out in any worktree.
 */
function getWorktreeBranches() {
  try {
    const output = exec("git worktree list --porcelain", { silent: true }) || "";
    const branches = new Set();
    for (const line of output.split("\n")) {
      const match = line.match(/^branch refs\/heads\/(.+)$/);
      if (match) branches.add(match[1]);
    }
    return branches;
  } catch {
    return new Set();
  }
}

/**
 * Creates a detached temporary worktree at the given branch's commit and returns its path.
 * Using --detach avoids the "branch already used by worktree" error when the branch
 * is already checked out elsewhere. The caller must call removeWorktree() when done.
 */
function addWorktree(branch) {
  const safeName = branch.replace(/\//g, "-");
  const tmpDir = `${os.tmpdir()}/rebase-downstream-${safeName}-${Date.now()}`;
  exec(`git worktree add --detach "${tmpDir}" "${branch}"`, { silent: true });
  return tmpDir;
}

function removeWorktree(worktreePath) {
  exec(`git worktree remove "${worktreePath}" --force`, {
    silent: true,
    ignoreError: true,
  });
}

/**
 * Force-updates a branch ref to point to HEAD of the given worktree path.
 * Uses git update-ref instead of `git branch -f` because git rejects branch
 * force-updates while the branch is checked out in another worktree.
 */
function updateBranchToWorktreeHead(branch, worktreePath) {
  const newHead = exec("git rev-parse HEAD", { silent: true, cwd: worktreePath }).trim();
  exec(`git update-ref "refs/heads/${branch}" "${newHead}"`, { silent: true });
}

module.exports = {
  exec,
  getCurrentBranch,
  getRemoteUrl,
  getBranchOwnCommits,
  fetchFromOrigin,
  checkoutBranch,
  pullBranch,
  resetHard,
  cherryPick,
  cherryPickSkip,
  getStatus,
  hasConflict,
  pushBranch,
  isGitRepository,
  getWorktreeBranches,
  addWorktree,
  removeWorktree,
  updateBranchToWorktreeHead,
};
