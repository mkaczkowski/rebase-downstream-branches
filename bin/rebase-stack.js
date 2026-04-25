#!/usr/bin/env node

/**
 * Rebase Stack
 *
 * Rebases an explicit ordered list of branches onto a base branch.
 * Unlike rebase-downstream-branches, this does not use GitHub CLI to discover
 * the chain. Instead, you provide the full stack order as arguments.
 *
 * Captures each branch's own commits upfront (before any rebasing) so that
 * hash changes from earlier rebases don't cause parent commits to leak into
 * downstream cherry-picks.
 *
 * Usage:
 *   rebase-stack main branch-a branch-b branch-c
 *   rebase-stack main branch-a branch-b --dry-run
 *   rebase-stack main branch-a branch-b --yes
 */

const { main } = require("./cli/rebase-stack-cli");
const VERSION = require("../package.json").version;

main(process.argv.slice(2), VERSION);
