/**
 * CLI orchestrator for rebase-stack.
 *
 * Rebases an explicit ordered branch stack. Captures each branch's own commits
 * before any rebasing starts so that hash changes from earlier rebases don't
 * pollute downstream cherry-picks.
 */

const { log, COLORS } = require("../utils/colors");
const {
  getCurrentBranch,
  fetchFromOrigin,
  checkoutBranch,
  isGitRepository,
  getBranchOwnCommits,
  branchExists,
  hasCleanWorkingTree,
} = require("../utils/git");
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
    } else if (!arg.startsWith("-")) {
      options.branches.push(arg);
    }
  }

  return options;
}

function showHelp() {
  log("\n📋 Rebase Stack", COLORS.bright);
  log("─".repeat(50));
  log("\nRebases an explicit ordered list of branches.", COLORS.dim);
  log("Captures own commits upfront to avoid hash drift.", COLORS.dim);
  log("\nUsage:", COLORS.cyan);
  log("  rebase-stack <base> <branch-1> <branch-2> [...]");
  log("\nArguments:", COLORS.cyan);
  log("  <base>        The base branch to rebase onto (e.g. main)");
  log("  <branch-N>    Branches in stack order (parent to child)");
  log("\nOptions:", COLORS.cyan);
  log("  -h, --help       Show this help message");
  log("  -v, --version    Show version number");
  log("  --dry-run        Preview changes without applying them");
  log("  -y, --yes        Skip confirmation prompt");
  log("\nExamples:", COLORS.cyan);
  log("  # Rebase a 3-branch stack onto main");
  log("  rebase-stack main feature-a feature-b feature-c");
  log("\n  # Preview what would be rebased");
  log("  rebase-stack main feature-a feature-b --dry-run");
  log("\n  # Skip confirmation (for scripting)");
  log("  rebase-stack main feature-a feature-b --yes");
  log("\nHow it works:", COLORS.cyan);
  log("  1. Captures each branch's own commits before any rebasing");
  log("  2. Creates backup refs for safety");
  log("  3. Rebases each branch onto its parent using cherry-pick");
  log("  4. Handles worktree-locked branches via temp worktrees");
  log("  5. Force pushes with --force-with-lease");
  log("");
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
 * Returns array of { branch, onto, commits } in stack order.
 */
function captureOwnCommits(base, branches) {
  const stack = [];

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i];
    const parent = i === 0 ? base : branches[i - 1];

    // getBranchOwnCommits returns newest-first; reverse for cherry-pick order
    const commits = getBranchOwnCommits(branch, parent);
    commits.reverse();

    stack.push({ branch, onto: parent, commits });
  }

  return stack;
}

async function executeRebase(base, stack, options) {
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

  if (options.branches.length < 2) {
    log("❌ At least 2 arguments required: <base> <branch-1> [branch-2 ...]", COLORS.red);
    log("   Run with --help for usage.", COLORS.dim);
    process.exit(1);
  }

  if (!isGitRepository()) {
    log("❌ Not a git repository.", COLORS.red);
    process.exit(1);
  }

  const base = sanitizeBranchName(options.branches[0]);
  const branches = options.branches.slice(1).map(sanitizeBranchName);

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

  await executeRebase(base, stack, options);
}

module.exports = { main };
