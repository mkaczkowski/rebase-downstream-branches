/**
 * GitHub CLI operations and utilities
 */

const { exec } = require("./git");
const { sanitizeBranchName } = require("./validation");
const { log, COLORS } = require("./colors");

/**
 * Detect GitHub Enterprise host from remote URL
 */
function detectGitHubHost(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }

  // Extract host from various URL formats
  // SSH: git@hostname:org/repo.git
  // HTTPS: https://hostname/org/repo.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):/);
  const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\//);

  const host = sshMatch?.[1] || httpsMatch?.[1];

  // Return null for standard GitHub (gh CLI default)
  if (host === "github.com") {
    return null;
  }

  return host;
}

/**
 * Find all PRs that target a specific branch using GitHub CLI
 */
function findPRsTargeting(baseBranch, host) {
  try {
    // Sanitize branch name to prevent command injection
    const safeBranch = sanitizeBranchName(baseBranch);

    // Set GH_HOST environment variable if using GitHub Enterprise
    const env = { ...process.env };
    if (host) {
      env.GH_HOST = host;
    }

    const result = exec(
      `gh pr list --base "${safeBranch}" --state open --json number,headRefName,title --limit 50`,
      { silent: true, env }
    );

    if (!result) return [];

    const prs = JSON.parse(result);
    return prs.map((pr) => ({
      number: pr.number,
      branch: sanitizeBranchName(pr.headRefName),
      title: pr.title,
      target: baseBranch,
    }));
  } catch (error) {
    log(
      `⚠️  Could not fetch PRs targeting ${baseBranch}: ${error.message}`,
      COLORS.yellow
    );
    return [];
  }
}

/**
 * Check if GitHub CLI is installed
 */
function isGitHubCLIInstalled() {
  try {
    exec("gh --version", { silent: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if GitHub CLI is authenticated
 */
function isGitHubCLIAuthenticated() {
  try {
    exec("gh auth status", { silent: true });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  detectGitHubHost,
  findPRsTargeting,
  isGitHubCLIInstalled,
  isGitHubCLIAuthenticated,
};
