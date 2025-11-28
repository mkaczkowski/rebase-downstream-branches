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

## Security Best Practices

When using this tool:

1. **Review changes before force-pushing** - Always use `--dry-run` first
2. **Use `--force-with-lease`** - The tool uses this by default to prevent accidental overwrites
3. **Authenticate GitHub CLI securely** - Use `gh auth login` with proper credentials
4. **Keep dependencies updated** - Although we have no dependencies, keep Node.js updated
5. **Review the code** - This is open source; review the code before running it with elevated privileges

## Known Limitations

- The tool requires force-push permissions on the repository
- The tool modifies git history; ensure you understand the implications
- Always backup important branches before running rebase operations

## Responsible Disclosure

We kindly ask that you follow responsible disclosure practices:

1. Give us reasonable time to address the issue before public disclosure
2. Do not exploit the vulnerability beyond what is necessary to demonstrate it
3. Act in good faith and avoid privacy violations

Thank you for helping keep this project secure!
