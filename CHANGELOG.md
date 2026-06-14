# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-06-15

### Added
- Release validation pipeline documentation

### Changed
- Updated `.npmignore` to properly exclude test and dev artifacts

### Security
- Documented dev dependency vulnerabilities (esbuild in vitest)

---

## [1.0.0] - 2026-06-14

### Added
- Initial release of Chain-as-Agent extension
- Chain loader with dependency graph analysis
- Chain registry with event system
- Checkpoint manager for chain state persistence
- Virtual agent adapter for PI subagent integration
- Context compression for efficient context propagation
- Full documentation suite (user guide, developer guide, migration guide)

### Features
- Multi-agent chain execution
- Context modes (inherit, inherit_compact, none)
- Retry logic with exponential backoff
- Cancellation support via AbortSignal
- Checkpointing for recovery
- Backward compatible API

### Security
- Initial security review complete
- Dev dependency vulnerabilities documented

---

