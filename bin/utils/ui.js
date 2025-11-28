/**
 * User interface utilities (prompts, help text, etc.)
 */

const readline = require("readline");
const { log, COLORS } = require("./colors");

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
 * Display help text
 */
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

/**
 * Display PR chain
 */
function displayPRChain(chain) {
  log("\n🔄 PR Chain to rebase:", COLORS.bright);
  log("─".repeat(60));
  chain.forEach((item, i) => {
    log(`  ${i + 1}. #${item.number} ${item.branch}`, COLORS.reset);
    log(`     └── targets: ${item.target}`, COLORS.dim);
  });
}

/**
 * Display backups
 */
function displayBackups(backups) {
  if (backups.length > 0) {
    log("\n💾 Backups created:", COLORS.cyan);
    backups.forEach(({ branch, ref }) => {
      log(`   ${branch}: ${ref}`, COLORS.dim);
    });
    log("\n   To restore a branch:", COLORS.dim);
    log(
      "   git checkout <branch> && git reset --hard <backup-ref>",
      COLORS.dim
    );
  }
}

/**
 * Display backup restore instructions
 */
function displayRestoreInstructions(backups) {
  if (backups.length > 0) {
    log("\n💡 To restore from backup:", COLORS.cyan);
    backups.forEach(({ branch, ref }) => {
      log(`   git checkout ${branch}`, COLORS.dim);
      log(`   git reset --hard ${ref}`, COLORS.dim);
    });
  }
}

module.exports = {
  promptConfirmation,
  showHelp,
  displayPRChain,
  displayBackups,
  displayRestoreInstructions,
};
