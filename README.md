# Rebase Downstream Branches

[![npm version](https://img.shields.io/npm/v/rebase-downstream-branches.svg)](https://www.npmjs.com/package/rebase-downstream-branches)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/rebase-downstream-branches.svg)](https://nodejs.org)
[![CI Status](https://github.com/mkaczkowski/rebase-downstream-branches/workflows/CI/badge.svg)](https://github.com/mkaczkowski/rebase-downstream-branches/actions)

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

## Example

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
