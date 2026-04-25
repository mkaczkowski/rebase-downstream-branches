# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a CLI tool that automatically discovers and rebases all downstream branches in a stacked PR chain using GitHub CLI. It's written in CommonJS Node.js with zero runtime dependencies.

## Development Commands

```bash
# Run the CLI locally
npm start [options]

# Run tests
npm test

# Run linting
npm run lint
npm run lint:fix

# Run formatting
npm run format
npm run format:check

# Test CLI commands directly
npm run test:help
npm run test:version
```

## Testing the CLI

To test the CLI with different options without publishing:

```bash
# Basic usage
node bin/rebase-downstream-branches.js

# With specific branch
node bin/rebase-downstream-branches.js feature-branch

# Dry run
node bin/rebase-downstream-branches.js --dry-run

# With GitHub Enterprise
node bin/rebase-downstream-branches.js --host github.mycompany.com

# Skip confirmation (useful for CI)
node bin/rebase-downstream-branches.js --yes
```

## Code Architecture

### Entry Points

- `bin/rebase-downstream-branches.js` - CLI entry point for PR-chain discovery mode
- `bin/rebase-stack.js` - CLI entry point (auto-discovery default, explicit mode with 2+ args)

### Core Modules

**bin/cli/**
- `index.js` - Main CLI orchestration for rebase-downstream-branches
- `args-parser.js` - Argument parsing for rebase-downstream-branches
- `rebase-stack-cli.js` - CLI orchestration for rebase-stack (auto-discovery via `findPRForBranch`, explicit mode, commit capture, execution)

**bin/core/**
- `cherry-pick.js` - Shared cherry-pick logic (used by both rebase.js and rebase-stack.js)
- `chain-builder.js` - PR chain discovery using `gh pr list --base <branch>`
- `rebase.js` - Core rebase logic using reset + cherry-pick (computes commits at rebase time)
- `rebase-stack.js` - Core rebase logic using pre-captured commits (for full-stack rebasing)

**bin/utils/**
- `git.js` - Git command wrappers (uses `execSync`)
- `github.js` - GitHub CLI integration, host detection, `findPRsTargeting` (downstream) and `findPRForBranch` (upstream)
- `validation.js` - Branch name sanitization and protected branch checks
- `backup.js` - Backup ref creation at `refs/backup/<branch>-<timestamp>`
- `ui.js` - Console output, prompts, and formatting
- `colors.js` - ANSI color utilities

### Key Architecture Patterns

**Rebase Strategy**

The tool does NOT use `git rebase` directly. Instead:
1. Get branch's own commits via `git log target..branch`
2. Checkout the branch
3. Hard reset to target: `git reset --hard <target>`
4. Cherry-pick commits in order (oldest first)
5. Force push with `--force-with-lease`

This approach provides better control over conflicts and allows skipping empty commits.

**Upfront Commit Capture (rebase-stack only)**

`rebase-stack` captures each branch's own commits via `git log parent..branch` before any
rebasing starts. This is critical because once the first branch is rebased, its commit hashes
change, which would cause `git log` to return stale parent commits for downstream branches.
The `rebase-downstream-branches` tool computes commits at rebase time, which works when only
downstream branches are being rebased (the starting branch stays unchanged).

**Chain Discovery**

Two discovery directions:

*Downstream* (`rebase-downstream-branches`, `buildPRChain()`):
1. Start from a base branch
2. Use `gh pr list --base <branch>` to find PRs targeting it
3. Follow the chain by using each PR's head branch as the next base
4. Detect and prevent circular references
5. Handle multiple PRs targeting same branch (uses first one)

*Upstream* (`rebase-stack`, `discoverStack()`):
1. Start from the current/specified branch
2. Use `gh pr list --head <branch>` to find the PR and read its base
3. Walk upward until hitting a protected branch (main, master, etc.)
4. Reverse the collected branches to get parent-to-child order
5. Detect circular references via visited set

**Security Layers**

Multiple validation stages before any git operations:
1. Branch name sanitization (prevents command injection)
2. Protected branch detection (main, master, develop, staging, production, prod)
3. User confirmation prompt (unless `--yes` flag)
4. Automatic backup creation before each rebase
5. Use of `--force-with-lease` instead of `--force`

## Code Style

- Uses ESLint with recommended rules (2-space indentation, double quotes, semicolons required)
- Uses Prettier for formatting (80-char line width)
- CommonJS modules (`require`/`module.exports`)
- Node.js 18+ required
- No external runtime dependencies

## Important Constraints

### Branch Name Validation

All branch names MUST pass `sanitizeBranchName()` which:
- Matches pattern: `^[a-zA-Z0-9/_.-]+$`
- Rejects names starting with `-`
- Rejects names containing `..`
- Prevents command injection

### Protected Branches

The following branches are protected and will cause the operation to abort if found in the PR chain:
- main, master
- develop, development
- staging, production, prod

These can be used as starting points but never as branches to rebase.

### GitHub Enterprise Support

The tool supports GitHub Enterprise via:
1. `--host` CLI flag
2. `GH_HOST` environment variable
3. Auto-detection from git remote URL (SSH or HTTPS format)

Standard `github.com` returns `null` to use gh CLI defaults.

## Error Handling

The tool stops immediately on first error and:
- Returns to original branch
- Displays backup refs for failed/completed operations
- Provides recovery instructions for conflicts
- Uses `process.exit(1)` for errors, `process.exit(0)` for success

## Testing

Tests are located in `test/cli.test.js` and use Node.js built-in test runner:

```bash
node --test
```

No external testing framework is used to maintain zero dependencies.
