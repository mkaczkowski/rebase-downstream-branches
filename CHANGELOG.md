# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-11-28

### Added

- Initial open-source release of the `rebase-downstream-branches` CLI.
- Automatic discovery of downstream PR chains via GitHub CLI.
- Support for GitHub Enterprise via auto-detected host, `GH_HOST`, or `--host`.
- Force-with-lease pushes for safer branch updates.
- Project documentation, license, contributing guide, and code of conduct.

### Fixed

- Improved resilience when repositories do not have an `origin` remote configured.
