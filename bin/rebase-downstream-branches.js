#!/usr/bin/env node

/**
 * Rebase Downstream Branches
 *
 * Automatically discovers and rebases all downstream branches in a stacked PR chain.
 * Uses GitHub CLI to find PRs that target the current branch.
 *
 * Usage:
 *   rebase-downstream-branches                       # From current branch
 *   rebase-downstream-branches <branch-name>         # From specific branch
 *   rebase-downstream-branches --dry-run             # Preview only
 *   rebase-downstream-branches --host <hostname>     # Use GitHub Enterprise
 */

const { execSync } = require("child_process");
const readline = require("readline");

const VERSION = require("../package.json").version;

const COLORS = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

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

/**
 * Get list of branches that would be modified
 */
function getBranchesInChain(chain) {
  return chain.map((item) => item.branch);
}

/**
 * Prompt user for confirmation
 */
function promptConfirmation(message) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

/**
 * Create backup refs for branches before rebasing
 */
function createBackup(branch) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRef = `refs/backup/${branch}-${timestamp}`;
  
  try {
    exec(`git update-ref ${backupRef} ${branch}`, { silent: true });
    return backupRef;
  } catch (error) {
    log(`⚠️  Could not create backup for ${branch}`, COLORS.yellow);
    return null;
  }
}

/**
 * Detect GitHub Enterprise host from remote URL
 */
function detectGitHubHost() {
  const remoteUrl = getRemoteUrl();
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
 * Build the complete PR chain starting from a branch
 */
function buildPRChain(startBranch, host) {
  const chain = [];
  const visited = new Set();
  let currentBranch = startBranch;

  log(`\n🔍 Discovering PR chain starting from: ${startBranch}`, COLORS.cyan);
  if (host) {
    log(`   Using GitHub host: ${host}`, COLORS.dim);
  }

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (visited.has(currentBranch)) {
      log(`⚠️  Circular reference detected at ${currentBranch}`, COLORS.yellow);
      break;
    }
    visited.add(currentBranch);

    const prs = findPRsTargeting(currentBranch, host);

    if (prs.length === 0) {
      break;
    }

    if (prs.length > 1) {
      log(
        `\n⚠️  Multiple PRs found targeting ${currentBranch}:`,
        COLORS.yellow
      );
      prs.forEach((pr, i) => {
        log(`   ${i + 1}. #${pr.number} ${pr.branch}`, COLORS.dim);
      });
      log(`   Using first one: #${prs[0].number}`, COLORS.dim);
    }

    const pr = prs[0];
    chain.push(pr);
    log(`   Found: #${pr.number} ${pr.branch} → ${pr.target}`, COLORS.dim);
    currentBranch = pr.branch;
  }

  return chain;
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
  exec(`git checkout ${branch}`, { silent: true });
  exec(`git reset --hard ${onto}`, { silent: true });

  // Cherry-pick all commits in order (oldest first)
  for (const commitHash of commitHashes) {
    try {
      exec(`git cherry-pick ${commitHash}`, { silent: true });
      log(`   ✅ Cherry-picked ${commitHash}`, COLORS.green);
    } catch (error) {
      // Check if there's a conflict
      const status = exec("git status --porcelain", { silent: true }) || "";
      if (
        status.includes("UU") ||
        status.includes("AA") ||
        status.includes("DD")
      ) {
        log("   ⚠️  Conflict detected! Resolve manually:", COLORS.yellow);
        log("      1. Fix conflicts in the files", COLORS.dim);
        log("      2. git add <files>", COLORS.dim);
        log("      3. git cherry-pick --continue", COLORS.dim);
        log("      4. Re-run this script", COLORS.dim);
        process.exit(1);
      }
      // If empty commit, skip
      exec("git cherry-pick --skip", { silent: true, ignoreError: true });
      log(
        `   ⏭️  Skipped ${commitHash} (no changes or already applied)`,
        COLORS.yellow
      );
    }
  }

  return true;
}

function pushBranch(branch) {
  log("   🚀 Force pushing...", COLORS.blue);
  exec(`git push origin ${branch} --force-with-lease`, { silent: true });
  log("   ✅ Pushed", COLORS.green);
}

function showHelp() {
  log("\n📋 Rebase Downstream Branches", COLORS.bright);
  log("─".repeat(50));
  log("\nAutomatically discovers and rebases stacked PRs.", COLORS.dim);
  log("\nUsage:", COLORS.cyan);
  log(
    "  rebase-downstream-branches                       # From current branch"
  );
  log(
    "  rebase-downstream-branches <branch>              # From specific branch"
  );
  log("  rebase-downstream-branches --dry-run             # Preview only");
  log(
    "  rebase-downstream-branches --host <hostname>     # Use GitHub Enterprise"
  );
  log("\nOptions:", COLORS.cyan);
  log("  -h, --help       Show this help message");
  log("  -v, --version    Show version number");
  log("  --dry-run        Preview changes without applying them");
  log("  -y, --yes        Skip confirmation prompt (automatic yes)");
  log(
    "  --host <host>    GitHub Enterprise hostname (auto-detected or from GH_HOST)"
  );
  log("\nHow it works:", COLORS.cyan);
  log("  1. Finds PRs that target the specified branch");
  log("  2. Follows the chain to find all downstream PRs");
  log("  3. Creates backup refs for safety");
  log("  4. Rebases each branch onto its updated parent");
  log("  5. Force pushes the rebased branches (with --force-with-lease)");
  log("\nSafety features:", COLORS.cyan);
  log("  • Branch name validation to prevent command injection");
  log("  • Protected branch detection (main, master, develop, etc.)");
  log("  • Confirmation prompt before making changes");
  log("  • Backup refs created before rebasing");
  log("  • Uses --force-with-lease for safer force pushes");
  log("\nRequires:", COLORS.cyan);
  log("  - GitHub CLI (gh) installed and authenticated");
  log("  - https://cli.github.com/");
  log("\nExamples:", COLORS.cyan);
  log("  # Rebase all PRs stacked on current branch");
  log("  rebase-downstream-branches");
  log("\n  # Rebase all PRs stacked on feature-branch");
  log("  rebase-downstream-branches feature-branch");
  log("\n  # Preview what would be rebased");
  log("  rebase-downstream-branches --dry-run");
  log("\n  # Skip confirmation prompt");
  log("  rebase-downstream-branches --yes");
  log("\n  # Use GitHub Enterprise");
  log("  rebase-downstream-branches --host github.mycompany.com");
  log("");
}

function parseArgs(args) {
  const options = {
    branch: null,
    dryRun: false,
    help: false,
    version: false,
    host: null,
    skipConfirmation: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--host" && args[i + 1]) {
      options.host = args[++i];
    } else if (arg === "--yes" || arg === "-y") {
      options.skipConfirmation = true;
    } else if (!arg.startsWith("-")) {
      options.branch = arg;
    }
  }

  return options;
}

function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    log(`rebase-downstream-branches v${VERSION}`);
    process.exit(0);
  }

  // Check for gh CLI
  try {
    exec("gh --version", { silent: true });
  } catch {
    log("❌ GitHub CLI (gh) is required but not found.", COLORS.red);
    log("   Install: https://cli.github.com/", COLORS.dim);
    process.exit(1);
  }

  // Verify we're in a git repository
  try {
    exec("git rev-parse --git-dir", { silent: true });
  } catch {
    log("❌ Not a git repository.", COLORS.red);
    log("   Please run this command from within a git repository.", COLORS.dim);
    process.exit(1);
  }

  // Check for gh authentication
  try {
    exec("gh auth status", { silent: true });
  } catch {
    log("❌ GitHub CLI is not authenticated.", COLORS.red);
    log("   Run: gh auth login", COLORS.dim);
    process.exit(1);
  }

  // Auto-detect host if not provided
  const host = options.host || process.env.GH_HOST || detectGitHubHost();

  // Get the starting branch
  let startBranch = options.branch || getCurrentBranch();

  if (!startBranch) {
    log("❌ Could not determine current branch.", COLORS.red);
    process.exit(1);
  }

  // Sanitize the starting branch name
  try {
    startBranch = sanitizeBranchName(startBranch);
  } catch (error) {
    log(`❌ ${error.message}`, COLORS.red);
    process.exit(1);
  }

  // Check if starting from a protected branch
  if (isProtectedBranch(startBranch)) {
    log(
      `\n⚠️  Starting from protected branch "${startBranch}"`,
      COLORS.yellow
    );
    log(
      "   This will find ALL stacked PRs targeting this branch.",
      COLORS.yellow
    );
  }

  // Build the chain
  const chain = buildPRChain(startBranch, host);

  if (chain.length === 0) {
    log("\n✅ No downstream PRs found. Nothing to rebase.", COLORS.green);
    process.exit(0);
  }

  // Check for protected branches in the chain
  const protectedBranchesInChain = getBranchesInChain(chain).filter(
    isProtectedBranch
  );

  if (protectedBranchesInChain.length > 0) {
    log("\n❌ Cannot rebase protected branches:", COLORS.red);
    protectedBranchesInChain.forEach((branch) => {
      log(`   • ${branch}`, COLORS.red);
    });
    log(
      "\n   Protected branches: main, master, develop, development, staging, production, prod",
      COLORS.dim
    );
    process.exit(1);
  }

  log("\n🔄 PR Chain to rebase:", COLORS.bright);
  log("─".repeat(60));
  chain.forEach((item, i) => {
    log(`  ${i + 1}. #${item.number} ${item.branch}`, COLORS.reset);
    log(`     └── targets: ${item.target}`, COLORS.dim);
  });

  if (options.dryRun) {
    log("\n📝 Dry run - no changes made", COLORS.yellow);
    process.exit(0);
  }

  log("\n⚠️  This will force-push the above branches.", COLORS.yellow);
  log(
    "   Backup refs will be created at refs/backup/<branch>-<timestamp>",
    COLORS.dim
  );

  // Prompt for confirmation unless --yes flag is provided
  (async () => {
    if (!options.skipConfirmation) {
      const confirmed = await promptConfirmation(
        "\n❓ Do you want to continue?"
      );
      if (!confirmed) {
        log("\n❌ Aborted by user.", COLORS.yellow);
        process.exit(0);
      }
    }

    // Save current branch
    const originalBranch = getCurrentBranch();

    log("\n🚀 Starting rebase...", COLORS.bright);
    log("─".repeat(50));

    // Fetch latest
    log("\n📥 Fetching latest from origin...", COLORS.cyan);
    try {
      exec("git fetch origin", { silent: true });
    } catch (error) {
      log(`⚠️  Could not fetch from origin: ${error.message}`, COLORS.yellow);
    }

    const backups = [];
    let successCount = 0;

    for (const item of chain) {
      try {
        // Create backup before rebasing
        log(`\n💾 Creating backup for ${item.branch}...`, COLORS.cyan);
        const backupRef = createBackup(item.branch);
        if (backupRef) {
          backups.push({ branch: item.branch, ref: backupRef });
          log(`   ✅ Backup created: ${backupRef}`, COLORS.green);
        }

        // Make sure we have the latest target
        exec(`git checkout ${item.target}`, {
          silent: true,
          ignoreError: true,
        });
        exec(`git pull origin ${item.target} --ff-only`, {
          silent: true,
          ignoreError: true,
        });

        rebaseBranch(item.branch, item.target);
        pushBranch(item.branch);
        successCount++;
      } catch (error) {
        log(`\n❌ Failed at ${item.branch}: ${error.message}`, COLORS.red);
        if (backups.length > 0) {
          log("\n💡 To restore from backup:", COLORS.cyan);
          backups.forEach(({ branch, ref }) => {
            log(`   git checkout ${branch}`, COLORS.dim);
            log(`   git reset --hard ${ref}`, COLORS.dim);
          });
        }
        break;
      }
    }

    // Return to original branch
    try {
      exec(`git checkout ${originalBranch}`, {
        silent: true,
        ignoreError: true,
      });
    } catch (error) {
      log(
        `⚠️  Could not return to original branch ${originalBranch}`,
        COLORS.yellow
      );
    }

    log("\n" + "─".repeat(50));
    log(`✅ Rebased ${successCount}/${chain.length} branches`, COLORS.green);

    if (backups.length > 0) {
      log("\n💾 Backups created:", COLORS.cyan);
      backups.forEach(({ branch, ref }) => {
        log(`   ${branch}: ${ref}`, COLORS.dim);
      });
      log("\n   To restore a branch:", COLORS.dim);
      log("   git checkout <branch> && git reset --hard <backup-ref>", COLORS.dim);
    }

    if (successCount < chain.length) {
      process.exit(1);
    }
  })();
}

main();
