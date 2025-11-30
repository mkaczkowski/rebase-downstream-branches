# Rebase Downstream Branches

[![npm version](https://img.shields.io/npm/v/rebase-downstream-branches.svg)](https://www.npmjs.com/package/rebase-downstream-branches)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/rebase-downstream-branches.svg)](https://nodejs.org)

A CLI tool that automatically discovers and rebases all downstream branches in a stacked PR chain using GitHub CLI.

## The Problem

When working with stacked PRs (multiple dependent pull requests), updating the base branch requires rebasing all downstream branches manually. This is tedious and error-prone, especially with long chains.

```
main ← PR #1 (feature-a) ← PR #2 (feature-b) ← PR #3 (feature-c)
```

If you update PR #1, you need to rebase PR #2, then PR #3, etc.

## The Solution

This tool automatically:

1. **Discovers** all PRs that target your branch (using GitHub CLI)
2. **Follows the chain** to find all downstream PRs recursively
3. **Rebases** each branch onto its updated parent
4. **Force pushes** the rebased branches (using `--force-with-lease`)

## Installation

```bash
# Install globally
npm install -g rebase-downstream-branches

# Or use npx directly
npx rebase-downstream-branches [options]
```

## Prerequisites

- [GitHub CLI](https://cli.github.com/) installed and authenticated
- Git repository with remote origin
- Node.js >= 18.0.0

```bash
# Install GitHub CLI
brew install gh  # macOS
# or see https://cli.github.com/

# Authenticate
gh auth login
```

## Usage

```bash
# Rebase all PRs stacked on current branch
rebase-downstream-branches

# Rebase all PRs stacked on a specific branch
rebase-downstream-branches feature-branch

# Preview what would be rebased (dry run)
rebase-downstream-branches --dry-run

# Use with GitHub Enterprise
rebase-downstream-branches --host github.mycompany.com
```

### Options

| Option              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `-h, --help`        | Show help message                                      |
| `-v, --version`     | Show version number                                    |
| `--dry-run`         | Preview changes without applying them                  |
| `--host <hostname>` | GitHub Enterprise hostname (auto-detected from remote) |

## Example: Dry Run

Preview a PR chain before making changes:

```bash
$ rebase-downstream-branches feature-a --dry-run

🔍 Discovering PR chain starting from: feature-a
   Found: #102 feature-b → feature-a
   Found: #103 feature-c → feature-b
   Found: #104 feature-d → feature-c

🔄 PR Chain to rebase:
────────────────────────────────────────────────────────────
  1. #102 feature-b
     └── targets: feature-a
  2. #103 feature-c
     └── targets: feature-b
  3. #104 feature-d
     └── targets: feature-c

📝 Dry run - no changes made
```

## Example: Real Rebase Session

Here's what happens when rebasing an 8-branch deep stack:

```bash
$ rebase-downstream-branches feature-base

🔍 Discovering PR chain starting from: feature-base
   Using GitHub host: github.mycompany.com
   Found: #101 webpack-plugin → feature-base
   Found: #102 cpu-utilities → webpack-plugin
   Found: #103 profiler-fixture → cpu-utilities
   Found: #104 test-api → profiler-fixture
   Found: #105 baseline-tests → test-api
   Found: #106 npm-scripts → baseline-tests
   Found: #107 pipeline-stage → npm-scripts
   Found: #108 pr-reporting → pipeline-stage

🔄 PR Chain to rebase:
────────────────────────────────────────────────────────────
  1. #101 webpack-plugin
     └── targets: feature-base
  2. #102 cpu-utilities
     └── targets: webpack-plugin
  3. #103 profiler-fixture
     └── targets: cpu-utilities
  4. #104 test-api
     └── targets: profiler-fixture
  5. #105 baseline-tests
     └── targets: test-api
  6. #106 npm-scripts
     └── targets: baseline-tests
  7. #107 pipeline-stage
     └── targets: npm-scripts
  8. #108 pr-reporting
     └── targets: pipeline-stage

⚠️  This will force-push the above branches.
   Backup refs will be created at refs/backup/<branch>-<timestamp>

❓ Do you want to continue? (y/N): y

🚀 Starting rebase...
──────────────────────────────────────────────────

📥 Fetching latest from origin...

💾 Creating backup for webpack-plugin...
   ✅ Backup created: refs/backup/webpack-plugin-2025-11-30T20-29-29-261Z

📦 Rebasing webpack-plugin onto feature-base...
   Commits to cherry-pick: 973c9e5
   ✅ Cherry-picked 973c9e5
   🚀 Force pushing...
   ✅ Pushed

💾 Creating backup for cpu-utilities...
   ✅ Backup created: refs/backup/cpu-utilities-2025-11-30T20-29-33-755Z

📦 Rebasing cpu-utilities onto webpack-plugin...
   Commits to cherry-pick: 973c9e5, 0411e11
   ⏭️  Skipped 973c9e5 (no changes or already applied)
   ✅ Cherry-picked 0411e11
   🚀 Force pushing...
   ✅ Pushed

💾 Creating backup for profiler-fixture...
   ✅ Backup created: refs/backup/profiler-fixture-2025-11-30T20-29-38-628Z

📦 Rebasing profiler-fixture onto cpu-utilities...
   Commits to cherry-pick: 973c9e5, 0411e11, 4359882
   ⏭️  Skipped 973c9e5 (no changes or already applied)
   ⏭️  Skipped 0411e11 (no changes or already applied)
   ✅ Cherry-picked 4359882
   🚀 Force pushing...
   ✅ Pushed

[... similar output for remaining 5 branches ...]

──────────────────────────────────────────────────
✅ Rebased 8/8 branches

💾 Backups created:
   webpack-plugin: refs/backup/webpack-plugin-2025-11-30T20-29-29-261Z
   cpu-utilities: refs/backup/cpu-utilities-2025-11-30T20-29-33-755Z
   profiler-fixture: refs/backup/profiler-fixture-2025-11-30T20-29-38-628Z
   test-api: refs/backup/test-api-2025-11-30T20-29-43-906Z
   baseline-tests: refs/backup/baseline-tests-2025-11-30T20-29-49-991Z
   npm-scripts: refs/backup/npm-scripts-2025-11-30T20-29-56-116Z
   pipeline-stage: refs/backup/pipeline-stage-2025-11-30T20-30-08-861Z
   pr-reporting: refs/backup/pr-reporting-2025-11-30T20-30-15-602Z

   To restore a branch:
   git checkout <branch> && git reset --hard <backup-ref>
```

### What Just Happened?

1. **Discovery**: Found 8 PRs in a dependency chain using GitHub CLI
2. **Safety Check**: Created backup refs before any modifications
3. **Smart Rebasing**: Automatically skipped commits already present in parent branches
4. **Force Push**: Used `--force-with-lease` for safer force pushes
5. **Recovery Info**: Provided backup refs for easy rollback if needed

The entire operation took about 46 seconds to rebase 8 branches with full safety guarantees.

## How It Works

1. **Discovery**: Uses `gh pr list --base <branch>` to find open PRs targeting the specified branch
2. **Chain Building**: Recursively follows the chain by finding PRs that target each discovered branch
3. **Rebasing**: For each branch in the chain:
   - Checks out the branch
   - Resets to the target branch
   - Cherry-picks all the branch's own commits (in order)
   - Force pushes to origin (using `--force-with-lease`)
4. **Conflict Handling**: If conflicts occur, the script stops and provides instructions for manual resolution

## GitHub Enterprise

The tool automatically detects GitHub Enterprise hosts from your remote URL. You can also specify it manually:

```bash
# Auto-detection (from git remote)
rebase-downstream-branches

# Manual specification
rebase-downstream-branches --host github.mycompany.com
```

The CLI will also respect the `GH_HOST` environment variable if it is already configured for the GitHub CLI.

## Workflow Tips

### After updating a base PR

```bash
# You've just pushed changes to feature-a
git push origin feature-a

# Rebase all downstream PRs
rebase-downstream-branches feature-a
```

### Before starting work

```bash
# Preview the chain from main
rebase-downstream-branches main --dry-run
```

### Handle conflicts

If the script encounters a merge conflict:

1. Resolve the conflicts in the files
2. Stage the resolved files: `git add <files>`
3. Continue the cherry-pick: `git cherry-pick --continue`
4. Re-run the script to continue with remaining branches

## Security

This tool uses `--force-with-lease` for safer force pushes, which prevents accidentally overwriting changes that you haven't seen. See our [Security Policy](SECURITY.md) for more details.

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## Code of Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

[MIT](LICENSE)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Related Projects

- [gh](https://cli.github.com/) - GitHub CLI
- [git-town](https://www.git-town.com/) - Git workflow tool
- [git-stack](https://github.com/gitext-rs/git-stack) - Stacked Git development
