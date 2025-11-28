/**
 * Branch name validation and security utilities
 */

/**
 * Sanitize branch name to prevent command injection
 */
function sanitizeBranchName(branch) {
  // Allow alphanumeric, hyphens, underscores, forward slashes, dots
  // This matches valid git branch names
  const validPattern = /^[a-zA-Z0-9/_.-]+$/;

  if (!validPattern.test(branch)) {
    throw new Error(
      `Invalid branch name: "${branch}". Branch names can only contain letters, numbers, /, _, ., and -`
    );
  }

  // Additional checks for dangerous patterns
  if (branch.includes("..") || branch.startsWith("-")) {
    throw new Error(
      `Potentially unsafe branch name: "${branch}". Branch names cannot start with - or contain ..`
    );
  }

  return branch;
}

/**
 * Check if a branch is protected (main, master, develop, etc.)
 */
function isProtectedBranch(branch) {
  const protectedBranches = [
    "main",
    "master",
    "develop",
    "development",
    "staging",
    "production",
    "prod",
  ];

  return protectedBranches.includes(branch.toLowerCase());
}

module.exports = {
  sanitizeBranchName,
  isProtectedBranch,
};
