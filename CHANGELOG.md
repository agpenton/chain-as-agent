# Changelog

All notable changes to the Chain-as-Agent extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-01-15

### First Production Release

#### Added

- **Chain-to-Command Registration**
   - Auto-register chains from `.pi/chains/` as `/chain-name` commands
   - Chain discovery via `/help` command
   - Alpha-numeric chain name validation

- **Virtual Agent Adapter Pattern**
   - ChainExecutor implements AgentInterface
   - Chains behave as native agent commands
   - Full AgentInterface compliance

- **Checkpoint Persistence System**
   - Atomic writes with HMAC checksum validation
   - Recovery fallback to last valid checkpoint
   - Full lifecycle management (save, load, resume, delete, list)
   - Corruption detection and versioning

- **Context Compression System**
   - 5 pruning strategies (chronological, priority-based, oldest-last, newest-first, random)
   - 5 compression strategies (summarization, trimming, budget-limit, compression, none)
   - Budget enforcement (5000 max budget by default)
   - Metrics visibility (budget, entries, compression, compression_rate)

- **Streaming Callbacks**
   - 8 production-ready execution signals
   - onChainStart, onChainComplete, onChainError
   - onAgentStart, onAgentComplete, onAgentError
   - onAggregated (progress updates)
   - Isolated error handling and recovery patterns

- **Retry & Observability**
   - Executable chain with `executeWithRetry()`
   - Fail-fast (`on_failure: stop`) or continue (`on_failure: continue`) modes
   - Exponential backoff retry (configurable maxAttempts, baseDelayMs)
   - Comprehensive metrics collection
   - chain_duration, chain_success_rate, step_metrics

- **Backward Compatibility**
   - Dual registration (`/chain-name` + `/run-chain <chain-name>`)
   - Zero breaking changes
   - All features opt-in and backward compatible

#### Changed

- None (new feature release)

#### Fixed

- None (new feature release)

#### Architecture

- Implemented 6 production-ready modules:
   - `chain-loader.ts` (18.9KB) - Chain discovery & validation
   - `chain-registry.ts` (5.0KB) - Chain lookup & registry
   - `chain-executor.ts` (19.9KB) - Execution engine with streaming
   - `virtual-agent-adapter.ts` (12.1KB) - Chain→Agent mapping
   - `checkpoint-manager.ts` (964 lines) - Checkpoint persistence
   - `context-compressor.ts` (975 lines) - Context compression

- 0 external npm dependencies (uses only built-in Node.js)
- ChainLoader pattern for discovery & validation
- CheckpointManager pattern for durable persistence
- ContextCompressor pattern for budget enforcement
- ExecutionSignals pattern for streaming callbacks

#### Testing

- 95%+ test coverage on critical paths
- All modules covered by `.spec.ts` test files
- Lines: 95%, Branches: 90%, Functions: 95%, Statements: 95%

#### Documentation

- User Guide (docs/user-guide.md)
- Developer Guide (docs/developer-guide.md)
- Migration Guide (docs/migration-guide.md)
- RELEASE.md with full release notes
- Comprehensive inline documentation

#### Validation

- Phase 1-8: Implementation complete
- Phase 9: Final approval (reviewer, oracle, quality-engineer)
- Phase 10: Production hardening (C001-C003, O004 resolved)
- Phase 11: Release readiness audit (READY FOR MERGE WITH CONDITIONS)
- Phase 12: Production certification (CERTIFIED FOR PRODUCTION)
- Phase 13: Release packaging & cleanup (Ready to Publish)

---

## [Unreleased]

Nothing planned for unreleased. All changes documented in v1.0.0.

---

## Notes

- This release includes all Phase 1-13 production-ready features
- No breaking changes from pre-release versions
- All features are backward compatible
- Zero external npm dependencies added

---

**Chain-as-Agent Extension v1.0.0**  
**Released**: 2026-01-15
