# Rebase Downstream Branches

[![npm version](https://img.shields.io/npm/v/rebase-downstream-branches.svg)](https://www.npmjs.com/package/rebase-downstream-branches)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/rebase-downstream-branches.svg)](https://nodejs.org)

Two CLI tools for rebasing stacked PRs. Both use a cherry-pick strategy (not `git rebase`), create backup refs before each operation, handle worktree-locked branches, and force-push with `--force-with-lease`.

## When to Use Which

```
main ← feature-a ← feature-b ← feature-c
```

**Use `rebase-downstream-branches`** when a single branch in the middle of the stack was updated and you need to propagate changes downstream. It discovers the chain automatically via GitHub PRs, so you don't need to remember the branch order. The starting branch itself is not rebased.

```bash
# You just pushed changes to feature-a, now rebase feature-b and feature-c
rebase-downstream-branches feature-a
```

**Use `rebase-stack`** when you need to rebase the entire stack onto a new base (e.g. main moved forward). By default it auto-discovers the stack by tracing PRs upward from your current branch to main. It captures each branch's own commits upfront (before any rebasing starts), so hash changes from earlier rebases don't corrupt downstream cherry-picks.

```bash
# main has new commits, auto-discover and rebase the entire stack
rebase-stack

# or provide branches explicitly (no gh CLI needed)
rebase-stack main feature-a feature-b feature-c
```

| | `rebase-downstream-branches` | `rebase-stack` |
|---|---|---|
| Direction | Discovers downward from a branch | Traces upward from current branch to base |
| Requires GitHub CLI | Yes | Auto-discovery: yes. Explicit mode: no |
| Commit capture | At rebase time | Upfront (before any rebasing) |
| Rebases starting branch | No (only downstream) | Yes (all branches in the stack) |
| Best for | One branch updated, propagate down | Entire stack onto new base |

## Installation

```bash
# Install globally
npm install -g rebase-downstream-branches

# Or use npx directly
npx rebase-downstream-branches [options]
npx rebase-stack [options]
```

## Prerequisites

- Git repository with remote origin
- Node.js >= 18.0.0
- [GitHub CLI](https://cli.github.com/) installed and authenticated (only for `rebase-downstream-branches`)

```bash
# Install GitHub CLI (only needed for rebase-downstream-branches)
brew install gh  # macOS
# or see https://cli.github.com/

# Authenticate
gh auth login
```

---

## rebase-downstream-branches

Automatically discovers and rebases all downstream branches in a stacked PR chain using GitHub CLI.

### Usage

```bash
# Rebase all PRs stacked on current branch
rebase-downstream-branches

# Rebase all PRs stacked on a specific branch
rebase-downstream-branches feature-branch

# Preview what would be rebased (dry run)
rebase-downstream-branches --dry-run

# Skip confirmation prompt
rebase-downstream-branches --yes

# Use with GitHub Enterprise
rebase-downstream-branches --host github.mycompany.com
```

### Options

| Option              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `-h, --help`        | Show help message                                      |
| `-v, --version`     | Show version number                                    |
| `--dry-run`         | Preview changes without applying them                  |
| `-y, --yes`         | Skip confirmation prompt                               |
| `--host <hostname>` | GitHub Enterprise hostname (auto-detected from remote) |

### Example: Dry Run

```bash
$ rebase-downstream-branches feature-a --dry-run

🔍 Discovering PR chain starting from: feature-a
   Found: #102 feature-b → feature-a
   Found: #103 feature-c → feature-b

🔄 PR Chain to rebase:
────────────────────────────────────────────────────────────
  1. #102 feature-b
     └── targets: feature-a
  2. #103 feature-c
     └── targets: feature-b

📝 Dry run - no changes made
```

### Example: Real Rebase Session

```bash
$ rebase-downstream-branches feature-base

🔍 Discovering PR chain starting from: feature-base
   Found: #101 webpack-plugin → feature-base
   Found: #102 cpu-utilities → webpack-plugin
   Found: #103 profiler-fixture → cpu-utilities

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

──────────────────────────────────────────────────
✅ Rebased 3/3 branches

💾 Backups created:
   webpack-plugin: refs/backup/webpack-plugin-2025-11-30T20-29-29-261Z
   cpu-utilities: refs/backup/cpu-utilities-2025-11-30T20-29-33-755Z

   To restore a branch:
   git checkout <branch> && git reset --hard <backup-ref>
```

### GitHub Enterprise

The tool auto-detects GitHub Enterprise hosts from your remote URL, or you can specify manually:

```bash
rebase-downstream-branches --host github.mycompany.com
```

Also respects the `GH_HOST` environment variable.

---

## rebase-stack

Rebases an entire stacked PR chain onto its base. By default, auto-discovers the stack by tracing PRs upward from the current branch to a protected base (main, master, etc.). Captures each branch's own commits before any rebasing starts, so downstream branches aren't affected by hash changes from earlier rebases.

### Two modes

**Auto-discovery (default):** Traces PRs upward from the current branch. Each branch must have an open PR. The walk stops when it reaches a protected branch (main, master, develop, etc.), which becomes the rebase base. Requires GitHub CLI.

**Explicit mode:** When 2+ positional arguments are given, treats them as `<base> <branch-1> <branch-2> ...`. No GitHub CLI needed.

### Why upfront commit capture matters

When rebasing a full stack, each branch is rebased sequentially. After branch A is rebased onto main, its commit hashes change. If branch B's own commits are computed at rebase time via `git log A..B`, the stale hashes from the old A leak into the result, causing conflicts on already-applied commits.

`rebase-stack` solves this by capturing all own commits before the first rebase begins.

### Usage

```bash
# Auto-discover stack from current branch and rebase
rebase-stack

# Auto-discover stack from a specific branch
rebase-stack feature-c

# Explicit: provide full branch order (no gh CLI needed)
rebase-stack main feature-a feature-b feature-c

# Preview what would be rebased
rebase-stack --dry-run

# Skip confirmation
rebase-stack --yes

# GitHub Enterprise
rebase-stack --host github.mycompany.com
```

### Options

| Option              | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `-h, --help`        | Show help message                                      |
| `-v, --version`     | Show version number                                    |
| `--dry-run`         | Preview changes without applying them                  |
| `-y, --yes`         | Skip confirmation prompt                               |
| `--host <hostname>` | GitHub Enterprise hostname (auto-detected from remote) |

### Example: Auto-Discovery

```bash
$ rebase-stack --dry-run

🔍 Discovering stack from feature-c...
   #104 feature-c → feature-b
   #103 feature-b → feature-a
   #102 feature-a → main

🔍 Capturing own commits for 3 branches...

🔄 Stack to rebase:
────────────────────────────────────────────────────────────
  base: main
  1. feature-a  (5 own commits)
     └── onto: main
  2. feature-b  (2 own commits)
     └── onto: feature-a
  3. feature-c  (3 own commits)
     └── onto: feature-b

📝 Dry run - no changes made
```

### Example: Real Rebase Session

```bash
$ rebase-stack main ipu-normalization ipu-cascade ipu-validation ipu-agent ipu-docs

🔍 Capturing own commits for 5 branches...

🔄 Stack to rebase:
────────────────────────────────────────────────────────────
  base: main
  1. ipu-normalization  (18 own commits)
     └── onto: main
  2. ipu-cascade  (2 own commits)
     └── onto: ipu-normalization
  3. ipu-validation  (1 own commit)
     └── onto: ipu-cascade
  4. ipu-agent  (3 own commits)
     └── onto: ipu-validation
  5. ipu-docs  (3 own commits)
     └── onto: ipu-agent

🚀 Starting rebase...
──────────────────────────────────────────────────

💾 Creating backup for ipu-normalization...
   ✅ Backup created: refs/backup/ipu-normalization-2026-04-25T20-42-02-942Z

📦 Rebasing ipu-normalization onto main...
   Commits to cherry-pick: 97c0557, fdfeb9f, 5763381, ...
   ✅ Cherry-picked 97c0557
   ✅ Cherry-picked fdfeb9f
   ...
   ⏭️  Skipped 260156f (no changes or already applied)
   ...
   🚀 Force pushing...
   ✅ Pushed

💾 Creating backup for ipu-cascade...
   ✅ Backup created: refs/backup/ipu-cascade-2026-04-25T20-42-15-123Z

📦 Rebasing ipu-cascade onto ipu-normalization...
   Commits to cherry-pick: c420557, 141200c
   ✅ Cherry-picked c420557
   ✅ Cherry-picked 141200c
   🚀 Force pushing...
   ✅ Pushed

[... remaining 3 branches ...]

──────────────────────────────────────────────────
✅ Rebased 5/5 branches
```

---

## Shared Features

Both tools share these safety features:

- **Backup refs** created before each rebase at `refs/backup/<branch>-<timestamp>`
- **Worktree-aware**: branches locked in existing worktrees are rebased via temporary detached worktrees using `git update-ref`, without disrupting your working directories
- **Branch name validation** to prevent command injection
- **Protected branch detection** (main, master, develop, staging, production, prod) prevents accidental rebase of critical branches
- **`--force-with-lease`** for safer force pushes
- **Conflict handling**: stops on first conflict with clear instructions, backup refs for rollback

### Handle Conflicts

If either tool encounters a merge conflict:

1. Resolve the conflicts in the files
2. Stage the resolved files: `git add <files>`
3. Continue the cherry-pick: `git cherry-pick --continue`
4. Re-run the command to continue with remaining branches

### Sync Worktrees After Rebase

If a branch was rebased while checked out in a worktree, that worktree still has old commits. Sync it:

```bash
cd /path/to/worktree
git reset --hard <branch-name>
```

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
