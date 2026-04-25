/**
 * Git operations utilities
 */

const { execSync } = require("child_process");

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

function resetHard(target) {
  return exec(`git reset --hard ${target}`, { silent: true });
}

function cherryPick(commitHash) {
  return exec(`git cherry-pick ${commitHash}`, { silent: true });
}

function cherryPickSkip() {
  return exec("git cherry-pick --skip", { silent: true, ignoreError: true });
}

function getStatus() {
  return exec("git status --porcelain", { silent: true }) || "";
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
 * Returns the set of branch names currently checked out in a worktree (excluding HEAD).
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
 * Creates a temporary worktree for a branch and returns its path.
 * The caller is responsible for removing it via removeWorktree().
 */
function addWorktree(branch) {
  const tmpDir = require("os").tmpdir() + "/rebase-downstream-" + branch.replace(/\//g, "-") + "-" + Date.now();
  exec(`git worktree add "${tmpDir}" "${branch}"`, { silent: true });
  return tmpDir;
}

function removeWorktree(worktreePath) {
  exec(`git worktree remove "${worktreePath}" --force`, { silent: true, ignoreError: true });
}

function resetHardInDir(target, cwd) {
  return exec(`git reset --hard "${target}"`, { silent: true, cwd });
}

function cherryPickInDir(commitHash, cwd) {
  return exec(`git cherry-pick "${commitHash}"`, { silent: true, cwd });
}

function cherryPickSkipInDir(cwd) {
  return exec("git cherry-pick --skip", { silent: true, ignoreError: true, cwd });
}

function getStatusInDir(cwd) {
  return exec("git status --porcelain", { silent: true, cwd }) || "";
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
  resetHardInDir,
  cherryPickInDir,
  cherryPickSkipInDir,
  getStatusInDir,
};
