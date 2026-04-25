/**
 * CLI orchestrator for rebase-stack.
 *
 * Default mode: auto-discovers the PR stack by tracing upward from the
 * current (or specified) branch to a protected base (e.g. main), then
 * rebases the entire stack.
 *
 * Explicit mode: when 2+ positional arguments are given, treats them as
 * <base> <branch-1> <branch-2> ... and rebases in that order.
 */

const { log, COLORS } = require("../utils/colors");
const {
  getCurrentBranch,
  getRemoteUrl,
  fetchFromOrigin,
  checkoutBranch,
  isGitRepository,
  getBranchOwnCommits,
  branchExists,
  hasCleanWorkingTree,
} = require("../utils/git");
const {
  detectGitHubHost,
  findPRForBranch,
  isGitHubCLIInstalled,
  isGitHubCLIAuthenticated,
} = require("../utils/github");
const { sanitizeBranchName, isProtectedBranch } = require("../utils/validation");
const { promptConfirmation, displayBackups, displayRestoreInstructions } = require("../utils/ui");
const { createBackup } = require("../utils/backup");
const { rebaseFromCommits, pushRebasedBranch } = require("../core/rebase-stack");

function parseArgs(args) {
  const options = {
    branches: [],
    dryRun: false,
    help: false,
    version: false,
    skipConfirmation: false,
    host: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      options.skipConfirmation = true;
    } else if (arg === "--host" && args[i + 1]) {
      options.host = args[++i];
    } else if (!arg.startsWith("-")) {
      options.branches.push(arg);
    }
  }

  return options;
}

function showHelp() {
  log("\n📋 Rebase Stack", COLORS.bright);
  log("─".repeat(50));
  log("\nRebases an entire stacked PR chain onto its base.", COLORS.dim);
  log("Captures own commits upfront to avoid hash drift.", COLORS.dim);
  log("\nUsage:", COLORS.cyan);
  log("  rebase-stack                                     # Auto-discover from current branch");
  log("  rebase-stack <branch>                            # Auto-discover from specific branch");
  log("  rebase-stack <base> <branch-1> <branch-2> [...]  # Explicit branch order");
  log("\nAuto-discovery (default):", COLORS.cyan);
  log("  Traces PRs upward from the target branch to a protected base");
  log("  (main, master, develop, etc.), then rebases the entire stack.");
  log("  Requires GitHub CLI (gh) installed and authenticated.");
  log("\nExplicit mode:", COLORS.cyan);
  log("  When 2+ positional arguments are given, treats them as an ordered");
  log("  list: <base> <branch-1> <branch-2> ... No GitHub CLI needed.");
  log("\nOptions:", COLORS.cyan);
  log("  -h, --help       Show this help message");
  log("  -v, --version    Show version number");
  log("  --dry-run        Preview changes without applying them");
  log("  -y, --yes        Skip confirmation prompt");
  log("  --host <host>    GitHub Enterprise hostname (auto-detected from remote)");
  log("\nExamples:", COLORS.cyan);
  log("  # Auto-discover and rebase stack ending at current branch");
  log("  rebase-stack");
  log("\n  # Auto-discover stack ending at a specific branch");
  log("  rebase-stack feature-c");
  log("\n  # Explicit: rebase a 3-branch stack onto main");
  log("  rebase-stack main feature-a feature-b feature-c");
  log("\n  # Preview what would be rebased");
  log("  rebase-stack --dry-run");
  log("\n  # GitHub Enterprise");
  log("  rebase-stack --host github.mycompany.com");
  log("");
}

/**
 * Discover the stack by tracing PRs upward from the given branch.
 * Returns { base, branches } where branches is ordered parent-to-child.
 */
function discoverStack(startBranch, host) {
  log(`\n🔍 Discovering stack from ${startBranch}...`, COLORS.cyan);
  if (host) {
    log(`   Using GitHub host: ${host}`, COLORS.dim);
  }

  const stack = [];
  let current = startBranch;
  const visited = new Set();

  while (true) {
    if (visited.has(current)) {
      log(`\n❌ Circular reference detected at ${current}`, COLORS.red);
      process.exit(1);
    }
    visited.add(current);

    const pr = findPRForBranch(current, host);
    if (!pr) {
      log(`\n❌ No open PR found for branch "${current}".`, COLORS.red);
      log("   All branches in the stack must have open PRs.", COLORS.dim);
      log("   Or use explicit mode: rebase-stack <base> <branch-1> ...", COLORS.dim);
      process.exit(1);
    }

    log(`   #${pr.number} ${current} → ${pr.base}`, COLORS.dim);
    stack.unshift(current);

    if (isProtectedBranch(pr.base)) {
      // Reached the root base
      return { base: pr.base, branches: stack };
    }

    current = pr.base;
  }
}

function displayStack(base, stack) {
  log("\n🔄 Stack to rebase:", COLORS.bright);
  log("─".repeat(60));
  log(`  base: ${base}`, COLORS.dim);
  stack.forEach((item, i) => {
    log(`  ${i + 1}. ${item.branch}  (${item.commits.length} own commit${item.commits.length === 1 ? "" : "s"})`, COLORS.reset);
    log(`     └── onto: ${item.onto}`, COLORS.dim);
  });
}

/**
 * Capture each branch's own commits before any rebasing.
 */
function captureOwnCommits(base, branches) {
  const stack = [];

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const parent = i === 0 ? base : branches[i - 1];

    const commits = getBranchOwnCommits(branch, parent);
    commits.reverse();

    stack.push({ branch, onto: parent, commits });
  }

  return stack;
}

async function executeRebase(stack, options) {
  if (!options.skipConfirmation) {
    const confirmed = await promptConfirmation("\n❓ Do you want to continue?");
    if (!confirmed) {
      log("\n❌ Aborted by user.", COLORS.yellow);
      process.exit(0);
    }
  }

  const originalBranch = getCurrentBranch();

  log("\n🚀 Starting rebase...", COLORS.bright);
  log("─".repeat(50));

  log("\n📥 Fetching latest from origin...", COLORS.cyan);
  if (!fetchFromOrigin()) {
    log("⚠️  Could not fetch from origin", COLORS.yellow);
  }

  const backups = [];
  let successCount = 0;

  for (const item of stack) {
    try {
      log(`\n💾 Creating backup for ${item.branch}...`, COLORS.cyan);
      const backupRef = createBackup(item.branch);
      if (backupRef) {
        backups.push({ branch: item.branch, ref: backupRef });
        log(`   ✅ Backup created: ${backupRef}`, COLORS.green);
      }

      rebaseFromCommits(item.branch, item.onto, item.commits);
      pushRebasedBranch(item.branch);
      successCount++;
    } catch (error) {
      log(`\n❌ Failed at ${item.branch}: ${error.message}`, COLORS.red);
      displayRestoreInstructions(backups);
      break;
    }
  }

  try {
    checkoutBranch(originalBranch, { ignoreError: true });
  } catch {
    log(`⚠️  Could not return to original branch ${originalBranch}`, COLORS.yellow);
  }

  log("\n" + "─".repeat(50));
  log(`✅ Rebased ${successCount}/${stack.length} branches`, COLORS.green);

  displayBackups(backups);

  if (successCount < stack.length) {
    process.exit(1);
  }
}

function validateGitHubCLI() {
  if (!isGitHubCLIInstalled()) {
    log("❌ GitHub CLI (gh) is required for auto-discovery.", COLORS.red);
    log("   Install: https://cli.github.com/", COLORS.dim);
    log("   Or use explicit mode: rebase-stack <base> <branch-1> ...", COLORS.dim);
    process.exit(1);
  }

  if (!isGitHubCLIAuthenticated()) {
    log("❌ GitHub CLI is not authenticated.", COLORS.red);
    log("   Run: gh auth login", COLORS.dim);
    process.exit(1);
  }
}

async function main(args, version) {
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  if (options.version) {
    log(`rebase-stack v${version}`);
    process.exit(0);
  }

  if (!isGitRepository()) {
    log("❌ Not a git repository.", COLORS.red);
    process.exit(1);
  }

  let base;
  let branches;

  if (options.branches.length >= 2) {
    // Explicit mode: <base> <branch-1> <branch-2> ...
    base = sanitizeBranchName(options.branches[0]);
    branches = options.branches.slice(1).map(sanitizeBranchName);
  } else {
    // Auto-discovery mode
    validateGitHubCLI();

    const host = options.host || process.env.GH_HOST || detectGitHubHost(getRemoteUrl());
    const startBranch = options.branches.length === 1
      ? sanitizeBranchName(options.branches[0])
      : getCurrentBranch();

    if (!startBranch) {
      log("❌ Could not determine current branch.", COLORS.red);
      process.exit(1);
    }

    if (isProtectedBranch(startBranch)) {
      log(`\n❌ Cannot start from protected branch "${startBranch}".`, COLORS.red);
      log("   Specify a feature branch or use explicit mode.", COLORS.dim);
      process.exit(1);
    }

    const discovered = discoverStack(startBranch, host);
    base = discovered.base;
    branches = discovered.branches;
  }

  // Validate no protected branches in the rebase targets
  const protectedInStack = branches.filter(isProtectedBranch);
  if (protectedInStack.length > 0) {
    log("\n❌ Cannot rebase protected branches:", COLORS.red);
    protectedInStack.forEach((b) => log(`   • ${b}`, COLORS.red));
    process.exit(1);
  }

  // Verify all branches exist locally
  const allBranches = [base, ...branches];
  const missing = allBranches.filter((b) => !branchExists(b));
  if (missing.length > 0) {
    log("\n❌ Branches not found locally:", COLORS.red);
    missing.forEach((b) => log(`   • ${b}`, COLORS.red));
    log("   Fetch from origin first: git fetch origin", COLORS.dim);
    process.exit(1);
  }

  // Check for dirty working tree
  if (!hasCleanWorkingTree()) {
    log("\n❌ Working tree has uncommitted changes.", COLORS.red);
    log("   Commit or stash them before rebasing.", COLORS.dim);
    process.exit(1);
  }

  log(`\n🔍 Capturing own commits for ${branches.length} branch${branches.length === 1 ? "" : "es"}...`, COLORS.cyan);

  const stack = captureOwnCommits(base, branches);

  const emptyBranches = stack.filter((s) => s.commits.length === 0);
  if (emptyBranches.length > 0) {
    log("\n⚠️  Branches with no own commits (will be fast-forwarded):", COLORS.yellow);
    emptyBranches.forEach((s) => log(`   • ${s.branch}`, COLORS.yellow));
  }

  displayStack(base, stack);

  if (options.dryRun) {
    log("\n📝 Dry run - no changes made", COLORS.yellow);
    stack.forEach((item) => {
      log(`\n  ${item.branch}:`, COLORS.dim);
      item.commits.forEach((h) => log(`    ${h}`, COLORS.dim));
    });
    process.exit(0);
  }

  log("\n⚠️  This will force-push the above branches.", COLORS.yellow);
  log("   Backup refs will be created at refs/backup/<branch>-<timestamp>", COLORS.dim);

  await executeRebase(stack, options);
}

module.exports = { main };
