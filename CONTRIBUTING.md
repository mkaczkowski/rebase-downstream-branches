# Contributing to Rebase Downstream Branches

Thank you for your interest in contributing! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/rebase-downstream-branches.git
   cd rebase-downstream-branches
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

## Development

### Running Locally

```bash
# Run directly
node bin/rebase-downstream-branches.js --help

# Or link globally for testing
npm link
rebase-downstream-branches --help
```

### Project Structure

```
rebase-downstream-branches/
├── bin/
│   └── rebase-downstream-branches.js   # CLI entry point
├── .github/workflows/         # CI/CD configuration (if added)
├── package.json
├── README.md
├── LICENSE
├── CONTRIBUTING.md
└── CODE_OF_CONDUCT.md
```

## Making Changes

1. Create a new branch:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Test your changes:

   ```bash
   node bin/rebase-downstream-branches.js --dry-run
   ```

4. Commit your changes:

   ```bash
   git commit -m "Add: description of your changes"
   ```

5. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

6. Open a Pull Request

## Commit Message Format

Use clear, descriptive commit messages:

- `Add: new feature description`
- `Fix: bug description`
- `Update: what was updated`
- `Remove: what was removed`
- `Docs: documentation changes`

## Pull Request Guidelines

- Provide a clear description of the changes
- Reference any related issues
- Ensure the CI checks pass
- Keep changes focused and atomic

## Reporting Issues

When reporting issues, please include:

- Node.js version (`node --version`)
- GitHub CLI version (`gh --version`)
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Error messages (if any)

## Code Style

- Use 4-space indentation
- Use single quotes for strings
- Add JSDoc comments for functions
- Keep functions small and focused

## Ideas for Contribution

- Add interactive mode for conflict resolution
- Support for selecting specific branches to rebase
- Add `--force-with-lease` option for safer force pushes
- Parallel rebasing for independent branches
- Better error messages and recovery options

## Questions?

Feel free to open an issue for any questions or concerns.

Thank you for contributing!
