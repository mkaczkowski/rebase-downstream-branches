# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-04-25

### Fixed

- Validate branch name before environment checks so invalid branch errors surface without requiring gh auth
- Fix integration test isolation when feature branch is checked out (worktree lock)

## [1.2.1] - 2026-04-25

### Changed

- Add GitHub Actions workflow to publish to npm on tag

## [1.2.0] - 2026-04-25

### Fixed

- Conflict detection now throws instead of calling process.exit(1), so cleanup (return to original branch, display backups) runs properly
- Cherry-pick catch block no longer silently drops commits on non-conflict errors
- Commit hash array reversal is now explicit instead of hidden inside a log statement

### Added

- Integration test suite with real git repo operations (conflict handling, commit ordering, empty commits, backups)

### Changed

- Cleaned up .gitignore duplicates and improved organization
- Improved code quality and documentation
- Strengthened CLI test assertions to validate output content instead of always passing

## [1.0.3] - 2025-11-28

### Fixed

- Minor bug fixes and improvements

## [1.0.2] - 2025-11-28

### Fixed

- Improved resilience when repositories do not have an `origin` remote configured

## [1.0.1] - 2025-11-28

### Fixed

- Minor documentation improvements

## [1.0.0] - 2025-11-28

### Added

- Initial open-source release of the `rebase-downstream-branches` CLI
- Automatic discovery of downstream PR chains via GitHub CLI
- Support for GitHub Enterprise via auto-detected host, `GH_HOST`, or `--host`
- Force-with-lease pushes for safer branch updates
- Project documentation, license, contributing guide, and code of conduct


































