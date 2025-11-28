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
};
