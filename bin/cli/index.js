/**
 * Main CLI logic
 */

const { log, COLORS } = require("../utils/colors");
const { getCurrentBranch, getRemoteUrl } = require("../utils/git");
const {
  detectGitHubHost,
  isGitHubCLIInstalled,
  isGitHubCLIAuthenticated,
} = require("../utils/github");
const {
  sanitizeBranchName,
  isProtectedBranch,
} = require("../utils/validation");
const { getBranchesInChain, buildPRChain } = require("../core/chain-builder");
const {
  promptConfirmation,
  showHelp,
  displayPRChain,
  displayBackups,
  displayRestoreInstructions,
} = require("../utils/ui");
const { parseArgs } = require("./args-parser");
const { createBackup } = require("../utils/backup");
const { rebaseBranch, pushRebasedBranch } = require("../core/rebase");
const {
  fetchFromOrigin,
  checkoutBranch,
  pullBranch,
  isGitRepository,
} = require("../utils/git");

/**
 * Validate environment requirements
 */
function validateEnvironment() {
  // Verify we're in a git repository
  if (!isGitRepository()) {
    log("❌ Not a git repository.", COLORS.red);
    log("   Please run this command from within a git repository.", COLORS.dim);
    process.exit(1);
  }

  // Check for gh CLI
  if (!isGitHubCLIInstalled()) {
    log("❌ GitHub CLI (gh) is required but not found.", COLORS.red);
    log("   Install: https://cli.github.com/", COLORS.dim);
    process.exit(1);
  }

  // Check for gh authentication
  if (!isGitHubCLIAuthenticated()) {
    log("❌ GitHub CLI is not authenticated.", COLORS.red);
    log("   Run: gh auth login", COLORS.dim);
    process.exit(1);
  }
}

/**
 * Determine GitHub host
 */
function determineHost(options) {
  return (
    options.host || process.env.GH_HOST || detectGitHubHost(getRemoteUrl())
  );
}

/**
 * Determine starting branch
 */
function determineStartBranch(options) {
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
    log(`\n⚠️  Starting from protected branch "${startBranch}"`, COLORS.yellow);
    log(
      "   This will find ALL stacked PRs targeting this branch.",
      COLORS.yellow
    );
  }

  return startBranch;
}

/**
 * Validate chain for protected branches
 */
function validateChain(chain) {
  const protectedBranchesInChain =
    getBranchesInChain(chain).filter(isProtectedBranch);

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
}

/**
 * Execute the rebase workflow
 */
async function executeRebase(chain, options) {
  // Prompt for confirmation unless --yes flag is provided
  if (!options.skipConfirmation) {
    const confirmed = await promptConfirmation("\n❓ Do you want to continue?");
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
  if (!fetchFromOrigin()) {
    log("⚠️  Could not fetch from origin", COLORS.yellow);
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
      checkoutBranch(item.target, { ignoreError: true });
      pullBranch(item.target);

      rebaseBranch(item.branch, item.target);
      pushRebasedBranch(item.branch);
      successCount++;
    } catch (error) {
      log(`\n❌ Failed at ${item.branch}: ${error.message}`, COLORS.red);
      displayRestoreInstructions(backups);
      break;
    }
  }

  // Return to original branch
  try {
    checkoutBranch(originalBranch, { ignoreError: true });
  } catch (error) {
    log(
      `⚠️  Could not return to original branch ${originalBranch}`,
      COLORS.yellow
    );
  }

  log("\n" + "─".repeat(50));
  log(`✅ Rebased ${successCount}/${chain.length} branches`, COLORS.green);

  displayBackups(backups);

  if (successCount < chain.length) {
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main(args, version) {
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    log(`rebase-downstream-branches v${version}`);
    process.exit(0);
  }

  validateEnvironment();

  const host = determineHost(options);
  const startBranch = determineStartBranch(options);

  // Build the chain
  const chain = buildPRChain(startBranch, host);

  if (chain.length === 0) {
    log("\n✅ No downstream PRs found. Nothing to rebase.", COLORS.green);
    process.exit(0);
  }

  validateChain(chain);
  displayPRChain(chain);

  if (options.dryRun) {
    log("\n📝 Dry run - no changes made", COLORS.yellow);
    process.exit(0);
  }

  log("\n⚠️  This will force-push the above branches.", COLORS.yellow);
  log(
    "   Backup refs will be created at refs/backup/<branch>-<timestamp>",
    COLORS.dim
  );

  await executeRebase(chain, options);
}

module.exports = {
  main,
};
