# Chain-as-Agent Extension Architecture

**Version**: 1.0  
**Status**: PROTOTYPE  
**Last Updated**: 2026-01-15

---

## Overview

The Chain-as-Agent extension transforms YAML chain definitions into native chain commands in the Tintinweb pi-subagents runtime. This architecture document describes the component architecture, data flows, and integration patterns.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Interface                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Chain Command (`/chain-name`)                   │
│                                                                  │
│  Example: /architecture-review -- "Analyze repository"           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Chain Loader (.pi/chains/*.yaml)                │
│                                                                  │
│  - Parse YAML chain definitions                                  │
│  - Validate agent references                                     │
│  - Detect circular dependencies                                  │
│  - Cache parsed chains                                          │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Chain Registry                               │
│                                                                  │
│  - Global chain lookup                                           │
│  - Chain discovery                                               │
│  - Event system                                                  │
│  - Metadata management                                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Virtual Agent Adapter                           │
│                                                                  │
│  - Map chains to AgentInterface                                  │
│  - Implement execute(), steer(), resume()                         │
│  - Error containment                                             │
│  - History tracking                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Chain Executor                              │
│                                                                  │
│  - Execute agents sequentially                                   │
│  - Context propagation (4 modes)                                 │
│  - Variable resolution                                           │
│  - Error handling (retry/fallback)                               │
│  - Timeout guards                                                │
│  - Checkpoint persistence                                        │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│               @tintinweb/pi-subagents Runtime                    │
│                                                                  │
│  - Agent execution (runAgent, resumeAgent)                       │
│  - Context management                                            │
│  - Streaming output                                              │
│  - Tool execution                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. ChainLoader

**Location**: `src/chain-loader/chain-loader.ts`

**Purpose**: Parse chain definitions from `.pi/chains/*.yaml` and `.pi/agents/*.md` files.

**Responsibilities**:
- Load YAML chain definitions
- Validate agent references
- Detect circular dependencies
- Cache parsed chains
- Support file watching

**Key Methods**:
```typescript
class ChainLoader {
  loadAll(): ChainDefinition[]        // Load all chains
  load(chainId: string): ChainDefinition? // Get chain by ID
  validate(chainId: string): ValidationResult  // Validate chain
}
```

**Data Flow**:
```
Files → Parse YAML → Validate → Cache → Emitted Events
```

---

### 2. ChainRegistry

**Location**: `src/chain-executor/chain-registry.ts`

**Purpose**: Global registry of all chains with event system.

**Responsibilities**:
- Chain lookup by ID
- Chain discovery
- Event subscription
- Metadata management

**Key Methods**:
```typescript
class ChainRegistry {
  getChain(chainId: string): ChainDefinition?  // Lookup chain
  listChains(): ChainDefinition[]               // List all chains
  getChainNames(): string[]                      // Get chain IDs
  refresh(): Promise<void>                        // Reload chains
  subscribe(callback): UnsubscribeFn              // Subscribe to events
}
```

**Event Types**:
```typescript
type ChainEvent = 
  | { type: 'chain_loaded'; chainId: string }
  | { type: 'chain_unloaded'; chainId: string }
  | { type: 'chain_updated'; chainId: string }
  | { type: 'chain_error'; chainId: string; error: string }
```

---

### 3. VirtualAgentAdapter

**Location**: `src/chain-executor/virtual-agent-adapter.ts`

**Purpose**: Map chains to AgentInterface for transparent tool invocation.

**Responsibilities**:
- Wrap chain in agent tool profile
- Implement execute(), steer(), resume()
- Error containment
- History tracking
- Steering support

**Interface Implementation**:
```typescript
class VirtualAgentAdapter implements AgentInterface {
  get agentInfo(): AgentDefinition
  
  async execute(prompt: string): Promise<AgentExecutionResult>
  async steer(chainId: string, message: string): Promise<void>
  async resume(id: string, prompt: string): Promise<AgentExecutionResult>
  getHistory(): ChainRecord[]
}
```

**Error Guarantee**: `execute()` NEVER throws - all errors returned in `AgentExecutionResult`

---

### 4. ChainExecutor

**Location**: `src/chain-executor/chain-executor.ts`

**Purpose**: Orchestrate sequential agent execution with context propagation.

**Responsibilities**:
- Execute chain agents sequentially
- Propagate context (4 modes)
- Resolve variables
- Handle errors (retry/fallback)
- Timeout guards
- Checkpoint persistence
- Stream progress

**Execution Model**:
```typescript
async execute(
  chain: ChainDefinition,
  context: ExtensionContext,
  prompt: string,
  signals?: ExecutionSignals  // Callbacks for streaming
): Promise<ChainExecutionResult>
```

**Context Modes**:
| Mode | Behavior |
|------|----------|
| `inherit` | Full conversation history |
| `inherit_compact` | Compressed context |
| `inherit_prompt_only` | First prompt only |
| `none` | Fresh context |

---

### 5. Backward Compatibility Shim

**Purpose**: Maintain `/run-chain` command while adding `/chain-name`.

**Behavior**:
- Both commands invoke same executor
- No semantic difference
- /run-chain shim shows deprecation warning

**Implementation**:
```typescript
// Legacy shim
pi.registerTool(defineTool({
  name: 'run-chain',
  // ... 
  run: async (params) => chainExecutor.execute(params.chainName)
}))
```

---

## Data Flows

### Chain Loading Flow
```
User adds chain YAML → ChainLoader parses → ChainRegistry caches → Commands registered
```

### Chain Execution Flow
```
/run-chain chain-name OR /chain-name
      ↓
VirtualAgentAdapter
      ↓
ChainExecutor (sequential execution)
      ↓
Agents executed via @tintinweb/pi-subagents runtime
      ↓
Streaming callbacks fire
      ↓
ChainExecutionResult returned
```

### Context Propagation Flow
```
Agent 0 executes → Result stored
      ↓
Agent 1 receives: Agent 0 result + previous context
      ↓
Agent 2 receives: Agent 1 result + accumulated context
      ↓
...
```

---

## State Management

### Chain State
```typescript
interface ChainDefinition {
  name: string;
  displayName: string;
  description: string;
  version: string;
  agents: ChainAgent[];
  config?: ChainConfig;
  metadata?: Record<string, unknown>;
}
```

### ChainExecutionResult
```typescript
interface ChainExecutionResult {
  success: boolean;
  chainId: string;
  agentResults: AgentResult[];
  aggregatedResult: string;
  metrics: ExecutionMetrics;
  chainConfig: ChainConfig;
  error?: string;
}
```

### Chain History
```typescript
interface ChainRecord {
  chainId: string;
  status: 'success' | 'failed' | 'cancelled';
  result?: string;
  executionTimeMs: number;
  agentsExecuted: number;
  agentsFailed: number;
  timestamp: string;
}
```

---

## Error Handling

### Chain-Level Errors
```typescript
// ALL errors contained, never thrown
execute() {
  try {
    // Execute chain
  } catch (e) {
    return {
      success: false,
      chainId: chain.name,
      error: e.message
      // Never throws
    }
  }
}
```

### Agent-Level Errors
```typescript
// Errors contained per agent
executeAgent() {
  try {
    // Execute agent
  } catch (e) {
    return {
      // ...
      error: e.message
      // Agent continues or fails based on config
    }
  }
}
```

### Error Containment Rules
1. ALL chain errors returned in `ChainExecutionResult.error`
2. ALWAYS return result, NEVER throw
3. Error context logged with timestamp
4. Execution time measured for all runs

---

## Configuration

### Chain YAML Schema
```yaml
name: chain-name
displayName: "Display Name"
description: "Chain description"
version: "1.0"

agents:
  - agent_type: agent-name
    prompt: "Task for this agent"
    context_mode: inherit_compact
    stop_on_error: false
    timeout_ms: 60000
    variables:
      VAR_NAME: value

config:
  max_total_turns: 100
  streaming: true
  aggregate_mode: sequential
  on_failure: continue
  fallback_chain: fallback-chain-name
  max_retries: 3
```

### Chain Variable Patterns
| Pattern | Resolution |
|---------|------------|
| `$VAR_NAME` | Environment variable |
| `{{var_name}}` | Chain variable |
| `{{agent_result:N}}` | Previous agent output |
| `{{file:path}}` | File content |

---

## Extension Points

### 1. Custom Resolvers
```typescript
chainLoader.registerVariableResolver(
  pattern: RegExp,
  resolver: (match: RegExpMatchArray, context) => string
)
```

### 2. Custom Context Builders
```typescript
chainLoader.registerContextBuilder(
  mode: ContextMode,
  builder: (context: ExtensionContext) => string
)
```

### 3. Custom Aggregators
```typescript
chainLoader.registerAggregator(
  mode: 'sequential' | 'parallel' | 'smart',
  aggregator: (results: AgentResult[]) => string
)
```

### 4. Stream Hooks
```typescript
chainLoader.registerStreamHook(
  hook: 'start' | 'progress' | 'complete' | 'error',
  callback: (event: ChainEvent) => void
)
```

---

## Observability

### Chain Events
```typescript
chain.started
chain.finished
chain.failed
chain.step.started
chain.step.finished
chain.step.failed
chain.step.retried
```

### Metrics
```typescript
chain_duration
chain_success_rate
chain_failure_rate
step_duration
step_success_rate
step_failure_rate
retry_count
```

### Logging
```
[ChainLoader] Loaded chain: architecture-review
[ChainExecutor] Executing chain: architecture-review
[ChainExecutor] Agent 0 (repo-analyzer) completed
[ChainExecutor] Agent 1 (architect) completed
[ChainExecutor] Chain complete: architecture-review (2500ms)
```

---

## Security

### Input Validation
- Chain names validated (alphanumeric, no spaces)
- Agent names validated (must exist)
- Chain definitions validated at load time
- Circular dependencies detected

### Error Containment
- No stack traces leaked
- Messages sanitized
- Errors logged internally only

### Context Isolation
- Agent contexts isolated by default
- Context sizes bounded
- Memory usage monitored

---

## Future Enhancements

1. **Parallel Execution Mode**
   - Agents run concurrently
   - Dependency graph respected
   - Results aggregated

2. **Checkpoint Versioning**
   - Multiple checkpoint versions
   - Rollback capability
   - Max checkpoint limit

3. **Usage Analytics**
   - Track chain usage
   - Frequency metrics
   - Performance dashboards

4. **Chain Templates**
   - Preset chain configurations
   - Chain composition
   - Template system

5. **External Chain Discovery**
   - Git repository chains
   - Remote chain registry
   - Chain marketplace

---

## Files Reference

### Core Files
- `src/chain-loader/chain-loader.ts` - Chain parsing and validation
- `src/chain-executor/chain-executor.ts` - Chain execution engine
- `src/chain-executor/virtual-agent-adapter.ts` - Chain to agent mapping
- `src/chain-executor/chain-registry.ts` - Chain registry
- `src/index.ts` - Entry point and command registration

### Support Files
- `src/chain-loader/dependency-graph.ts` - Cycle detection
- `src/chain-types.ts` - Type definitions
- `src/chain-hooks.ts` - Hook system
- `src/chain-telemetry.ts` - Observability

---

## Dependencies

Internal Dependencies:
- `@tintinweb/pi-subagents` (already installed)
- No external npm packages

No Breaking Changes:
- Preserves all existing APIs
- Maintains backward compatibility
- Extends without replacing

---

*Architecture Document v1.0*
*Last Updated: 2026-01-15*
