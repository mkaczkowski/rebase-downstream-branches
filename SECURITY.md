# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please send an email to the maintainer. All security vulnerabilities will be promptly addressed.

**Please do not open public issues for security vulnerabilities.**

### What to include in your report

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- We will acknowledge your email within 48 hours
- We will provide a detailed response within 7 days
- We will work on a fix and release a patch as soon as possible

## Built-in Security Features

This tool includes multiple layers of protection to prevent accidental damage:

### 1. Input Validation & Sanitization

- **Branch name validation**: All branch names are validated against a safe pattern (`^[a-zA-Z0-9/_.-]+$`)
- **Command injection prevention**: Branch names cannot contain dangerous characters or patterns
- **Pattern rejection**: Names starting with `-` or containing `..` are rejected

### 2. Protected Branch Detection

The tool automatically prevents rebasing of commonly protected branches:

- `main`, `master`
- `develop`, `development`
- `staging`, `production`, `prod`

If any branch in the PR chain is protected, the operation is aborted before any changes are made.

### 3. User Confirmation

- **Interactive prompt**: Asks for explicit confirmation before making changes (unless `--yes` flag is used)
- **Dry-run mode**: Preview all changes with `--dry-run` before executing
- **Clear warnings**: Shows which branches will be force-pushed

### 4. Automatic Backups

Before rebasing each branch, the tool:

- Creates a backup ref at `refs/backup/<branch>-<timestamp>`
- Displays the backup location after completion
- Provides instructions for restoring from backup if needed

**To restore a branch from backup:**

```bash
git checkout <branch>
git reset --hard <backup-ref>
```

### 5. Safe Force Push

- Uses `--force-with-lease` instead of `--force`
- Prevents overwriting changes you haven't seen
- Fails if remote has been updated by someone else

### 6. Error Handling

- Stops immediately if any branch fails to rebase
- Shows clear error messages with recovery instructions
- Returns to original branch even if operation fails
- Provides backup restoration instructions on failure

## Security Best Practices

When using this tool:

1. **Always use `--dry-run` first** - Preview changes before applying them

   ```bash
   rebase-downstream-branches --dry-run
   ```

2. **Review the PR chain** - Ensure all branches in the chain are intentional

   ```bash
   # The tool will show the complete chain before asking for confirmation
   ```

3. **Keep your local repository clean** - Commit or stash changes before running

   ```bash
   git status  # Should be clean
   ```

4. **Verify GitHub CLI authentication** - Ensure you're authenticated as the right user

   ```bash
   gh auth status
   ```

5. **Use in CI/CD carefully** - If automating, use the `--yes` flag and ensure proper access controls

   ```bash
   rebase-downstream-branches --yes  # Skip confirmation
   ```

6. **Check backups after operation** - Verify backups were created successfully
   ```bash
   git show-ref | grep backup
   ```

## What This Tool Does NOT Do

To be transparent about safety:

- ❌ Does NOT modify your main/master branches
- ❌ Does NOT delete any branches
- ❌ Does NOT modify commits (only rebases them)
- ❌ Does NOT push to branches outside the discovered PR chain
- ❌ Does NOT create or merge pull requests
- ❌ Does NOT modify your working directory (except during rebase operations)

## Recovery from Issues

### If a rebase fails with conflicts

```bash
# Option 1: Resolve and continue
git add <resolved-files>
git cherry-pick --continue
rebase-downstream-branches  # Re-run to continue with remaining branches

# Option 2: Abort and restore
git cherry-pick --abort
git checkout <branch>
git reset --hard <backup-ref>
```

### If you want to undo all changes

```bash
# Restore each branch from its backup
git checkout branch-1
git reset --hard refs/backup/branch-1-<timestamp>
git push origin branch-1 --force-with-lease

# Repeat for each branch
```

### Finding your backups

```bash
# List all backup refs
git show-ref | grep backup

# Show backup details
git log <backup-ref> -n 1
```

## Known Limitations

- The tool requires force-push permissions on the repository
- The tool modifies git history; ensure you understand the implications
- Backups are stored locally; push them manually if needed elsewhere
- The tool assumes a linear PR chain (no merges between PRs)
- Maximum of 50 PRs in a chain (configurable in code)

## Dependencies

This tool has zero runtime dependencies to minimize supply chain risks:

- Uses only Node.js built-in modules (`child_process`, `readline`)
- Requires external tools: `git` and `gh` (GitHub CLI)

## Responsible Disclosure

We kindly ask that you follow responsible disclosure practices:

1. Give us reasonable time to address the issue before public disclosure
2. Do not exploit the vulnerability beyond what is necessary to demonstrate it
3. Act in good faith and avoid privacy violations

Thank you for helping keep this project secure!
