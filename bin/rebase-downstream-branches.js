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

const { main } = require("./cli");
const VERSION = require("../package.json").version;

main(process.argv.slice(2), VERSION);
