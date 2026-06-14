# Chain-as-Agent Extension

**A production-ready extension for `@tintinweb/pi-subagents` that transforms chain workflows into transparent, first-class commands.**

---

## Overview

The Chain-as-Agent extension allows you to execute multi-agent chains as native commands. Instead of using:

```bash
/run-chain <chain-name> -- <prompt>
```

You can now invoke chains directly:

```bash
/architecture-review -- Analyze repository
```

---

## Features

- **Native Commands**: Chains automatically register as `/chain-name` commands
- **Backward Compatible**: Dual registration preserves `/run-chain <chain-names>` syntax
- **Streaming Support**: Real-time progress callbacks during chain execution
- **Context Compression**: Configurable context budget with multiple strategies
- **Checkpoint Persistence**: Durable checkpoints with atomic writes and recovery
- **Retry & Observability**: Comprehensive metrics collection

---

## Installation

### Install via npm

```bash
npm install @agpenton/chain-as-agent
```

### Install via PI

```bash
pi install npm:@agpenton/chain-as-agent
```

---

## Quick Start

### Basic Chain Execution

Execute a chain directly:

```bash
/architecture-review -- Analyze the repository
```

### Chain Discovery

List available chains:

```bash
/help
# Shows all registered chain commands
```

### Chain Configuration

Chains are YAML files in `.pi/chains/`:

```yaml
# .pi/chains/research.yaml
name: research
displayName: Research Chain
description: Research chain
agents:
   - researcher
   - analyst
context_budget: 5000
on_failure: stop
```

---

## Chain Configuration

### Context Propagation Modes

Chain contexts can propagate differently:

- `inherit`: Full context inheritance
- `inherit_compact`: Compact context with budget enforcement
- `inherit_prompt_only`: Only prompt passed
- `none`: No context propagation

### Execution Modes

#### Sequential (on_failure: stop)

All agents execute sequentially. On failure:

```bash
/architecture-review -- Analyze repository
```

#### Continue on Failure

```yaml
chains:
  research:
    agents:
      - researcher
      - analyst
    on_failure: continue
```

### Retry Support

Exponential backoff with configurable retries:

```typescript
await chain.executeWithRetry(chainId, prompt, {
  maxAttempts: 3,
  backoffMultiplier: 2,
  baseDelayMs: 1000
});
```

---

## Usage Examples

### Example Chain Commands

```bash
# Architecture review
/architecture-review -- Analyze this repository

# Planning chain
/planning-chain -- Create a project plan

# Research chain
/research-chain -- Research the topic

# Data analysis chain
/data-analysis-chain -- Analyze the dataset
```

### Chain Discovery

```bash
# List all chains
/help

# Execute a chain
/architecture-review -- Analyze the project structure
```

---

## Documentation

- [User Guide](docs/user-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [Migration Guide](docs/migration-guide.md)
- [Release Notes](RELEASE.md)

---

## Development

### Setup

```bash
npm install
npm test
```

### Testing

```bash
# Run all tests
npm test

# With coverage
npm run test:coverage

# UI test runner
npm run test:ui
```

---

## Architecture

```
User
 │
 ▼
/chain-name
 │
 ▼
Command Resolver
 │
 ▼
Chain Agent Adapter
 │
 ▼
Chain Executor
 │
 ▼
@tintinweb/pi-subagents Runtime
```

---

## Package Metadata

- **Name**: `@agpenton/chain-as-agent`
- **Version**: 1.0.0
- **License**: MIT
- **Repository**: https://github.com/agpenton/chain-as-agent
- **Keywords**: pi-agent, chain, agentic-workflow, multi-agent, plugin
- **Peer Dependency**: `@tintinweb/pi-subagents@0.10.3`

---

## Non-Goals

- ❌ No external npm dependencies (uses only built-in Node.js)
- ❌ No external dependencies (uses only `@tintinweb/pi-subagents`)
- ❌ No fork or modification of Tintinweb packages
- ❌ No breaking changes to existing APIs
- ❌ No parallel runtime creation

---

## License

MIT License

---

## Compatibility

| PI Version | Chain-as-Agent |
|------------|----------------|
| `@tintinweb/pi-subagents@0.10.3` | ✅ Supported |

---

## Release

**Version**: 1.0.0  
**Status**: Production ready  
**Release Date**: 2026-01-15

See [RELEASE.md](RELEASE.md) for detailed release notes.

---

*Chain-as-Agent Extension v1.0.0*
