# Chain-as-Agent Extension - Developer Guide

**Version**: 1.0  
**Last Updated**: 2026-01-15

---

## Overview

This guide provides implementation details for developers building or extending the Chain-as-Agent extension. Covers architecture, APIs, extension points, and patterns.

---

## Getting Started

### Project Structure

```text
.
├── src/
│   ├── chain-loader/
│   │   ├── chain-loader.ts        # Chain discovery & parsing
│   │   └── dependency-graph.ts    # Cycle detection
│   ├── chain-executor/
│   │   ├── chain-executor.ts     # Chain execution engine
│   │   ├── virtual-agent-adapter.ts # Chain to agent mapping
│   │   └── chain-registry.ts      # Global chain registry
│   └── index.ts                   # Entry point
├── .pi/
│   └── chains/                    # Chain YAML files
│   └── agents/                    # Agent .md files
└── .pi/chains/checkpoints/       # Execution checkpoints
```

### Installation

The extension is loaded automatically from `.pi/chain-as-agent-extension.js`:

```bash
cd ~/.pi/WIP/chains
cat .pi/chain-as-agent-extension.js
```

No additional installation required.

---

## Core APIs

### ChainLoader API

**Location**: `src/chain-loader/chain-loader.ts`

```typescript
class ChainLoader {
  // Load all chains from .pi/chains/*.yaml
  loadAll(): ChainDefinition[]
  
  // Get single chain by ID
  load(chainId: string): ChainDefinition | undefined
  
  // Validate chain
  validate(chainId: string): ValidationResult
  
  // Set event hook
  setOnChainLoad(callback: (chainId: string) => void): void
  setOnChainError(callback: (chainId: string, error: Error) => void): void
  
  // Register custom variable resolver
  registerVariableResolver(
    pattern: RegExp,
    resolver: (match: RegExpMatchArray, context: VariableContext) => string
  ): void
}
```

**Example**:
```typescript
import { ChainLoader } from './src/chain-loader/chain-loader';

const loader = new ChainLoader();
const chains = loader.loadAll();
console.log(`Loaded ${chains.length} chains`);

const chain = loader.load('research');
if (chain) {
  console.log(`Chain: ${chain.displayName}`);
}
```

### ChainRegistry API

**Location**: `src/chain-executor/chain-registry.ts`

```typescript
class ChainRegistry {
  // Load chains from disk
  async refresh(): Promise<void>
  
  // Get single chain
  getChain(chainId: string): ChainDefinition | undefined
  
  // List all chains
  listChains(): ChainDefinition[]
  
  // Get chain names only
  getChainNames(): string[]
  
  // Subscribe to chain events
  subscribe(callback: (event: ChainEvent) => void): UnsubscribeFn
  
  // Validate all chains
  validateAll(): { valid: ChainDefinition[], invalid: Chain[] }
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

**Example**:
```typescript
const registry = new ChainRegistry(loader);

// Get chain
const chain = registry.getChain('research');

// List all chains
const chains = registry.listChains();
chains.forEach(c => console.log(c.name));

// Subscribe to events
const unsub = registry.subscribe(event => {
  if (event.type === 'chain_loaded') {
    console.log(`Chain loaded: ${event.chainId}`);
  }
});
unsub(); // Unsubscribe
```

### ChainExecutor API

**Location**: `src/chain-executor/chain-executor.ts`

```typescript
class ChainExecutor {
  // Execute chain (ENTRY POINT)
  execute(
    chain: ChainDefinition,
    context: ExtensionContext,
    prompt: string,
    signals?: ExecutionSignals   // Optional callbacks
  ): Promise<ChainExecutionResult>
  
  // Resume from checkpoint
  resume(
    chainId: string,
    checkpoint: CheckpointData,
    context: ExtensionContext,
    prompt: string
  ): Promise<ChainExecutionResult>
  
  // Execute single agent (internal)
  private executeAgent(
    chainId: string,
    agent: ChainAgent,
    context: ExtensionContext,
    priorResults: AgentResult[]
  ): Promise<AgentResult>
  
  // Build context for agent
  private buildContext(
    contextMode: ContextMode,
    parentContext: ExtensionContext,
    priorResults: AgentResult[]
  ): string | null
  
  // Resolve variables
  resolveVariables(template: string, context: VariableContext): string
}
```

**ExecutionSignals**:
```typescript
interface ExecutionSignals {
  onAgentStart?: (chainId: string, agentIdx: number) => void
  onAgentComplete?: (chainId: string, agentIdx: number, result: AgentResult) => void
  onAgentError?: (chainId: string, agentIdx: number, error: string) => void
  onProgress?: (progress: ChainProgress) => void
  onAggregated?: (partialResult: string) => void
  onChainComplete?: (result: ChainExecutionResult) => void
  onChainError?: (error: string) => void
  signal?: AbortSignal
}
```

**Example**:
```typescript
const executor = new ChainExecutor();

// Execute chain
const result = await executor.execute(
  chain,
  { cwd: process.cwd() },
  'Analyze repository',
  {
    onAgentStart: (chainId, agentIdx) => {
      console.log(`Agent ${agentIdx} starting...`);
    },
    onAgentComplete: (chainId, agentIdx, result) => {
      console.log(`Agent ${agentIdx} complete: ${result.result.substring(0, 50)}...`);
    },
    onChainComplete: (result) => {
      console.log(`Chain complete: ${result.aggregatedResult}`);
    }
  }
);

// Check result
if (result.success) {
  console.log('Success!');
} else {
  console.log(`Failed: ${result.error}`);
}
```

### VirtualAgentAdapter API

**Location**: `src/chain-executor/virtual-agent-adapter.ts`

```typescript
class VirtualAgentAdapter {
  // Map chain to AgentInterface
  getAgentInfo(chainId: string): AgentDefinition | undefined
  
  // Execute chain as agent (ENTRY POINT)
  async execute(chainId: string, prompt: string, context?: ExtensionContext): Promise<AgentExecutionResult>
  
  // Chain never throws - errors contained
  // All errors in result.status === 'failed'
  
  // Steer running chain
  async steer(chainId: string, message: string): Promise<void>
  
  // Resume from checkpoint
  async resume(chainId: string, checkpoint: unknown, prompt: string, context?: ExtensionContext): Promise<AgentExecutionResult>
  
  // Get execution history
  getHistory(chainId?: string): ChainRecord[]
  
  // Set chain active
  setActiveChain(chainId: string): void
  
  // Mark chain completed
  markChainCompleted(chainId: string): void
}
```

**Example**:
```typescript
const adapter = new VirtualAgentAdapter(loader, registry, executor);

// Execute chain
const result = await adapter.execute('research', 'Analyze AI trends');

// Check result
if (result.status === 'success') {
  console.log(`Chain ${result.chainId} succeeded`);
} else {
  console.log(`Chain ${result.chainId} failed`);
}

// Steer chain
await adapter.steer('research', 'Focus on LLM agents');

// Get history
const history = adapter.getHistory('research');
console.log(`Executed ${history.length} times`);
```

---

## Chain Definition Schema

### Required Fields

```yaml
name: research-chain           # Chain ID (unique)
displayName: "Research Chain"  # Display name
description: "Research workflow" # Chain purpose
version: "1.0"                  # Schema version
agents:                         # Agent list
  - agent_type: general-purpose
    prompt: "Research topic"
```

### Optional Fields

```yaml
config:
  max_total_turns: 100         # Chain-wide turn limit
  streaming: true               # Enable streaming
  aggregate_mode: sequential    # parallel|sequential|smart
  on_failure: continue          # continue|stop|fallback
  fallback_chain: fail-chain    # Fallback chain ID
  
metadata:                       # Optional metadata
  author: "team"
  tags: ["research", "analysis"]
```

### Per-Agent Fields

```yaml
agents:
  - agent_type: general-purpose  # Required
    prompt: "Research topic"      # Required
    context_mode: inherit_compact # inherit|inherit_compact|inherit_prompt_only|none
    stop_on_error: false          # Default: false
    timeout_ms: 60000             # Default: 60000
    retry_count: 3                # Default: 3
    backoff_base_ms: 1000         # Default: 1000
    variables:                    # Chain variables
      TOPIC: "software engineering"
```

---

## Context Propagation Modes

### inherit

Full conversation history passed to agent.

```yaml
context_mode: inherit
```

**Use Case**: Complex multi-step tasks requiring full context

**Pros**: Complete context
**Cons**: Token-heavy

### inherit_compact

Compressed context (summary + key turns).

```yaml
context_mode: inherit_compact
```

**Use Case**: Most chains (recommended default)

**Pros**: Balanced context & efficiency
**Cons**: Some context lost

### inherit_prompt_only

First prompt only.

```yaml
context_mode: inherit_prompt_only
```

**Use Case**: Stateless execution

**Pros**: Minimal context
**Cons**: No prior context

### none

Fresh context.

```yaml
context_mode: none
```

**Use Case**: Independent tasks

**Pros**: No context dependency
**Cons**: No context

---

## Error Handling Patterns

### Contained Errors

Chain execution NEVER throws. Errors returned in result.

```typescript
async execute(chainId: string, prompt: string): Promise<AgentExecutionResult> {
  try {
    // Execute chain
  } catch (e) {
    return {
      result: `Chain execution failed: ${e.message}`,
      chainId,
      status: 'failed',
      executionTimeMs: Date.now() - startTime,
      errorContext: {
        errorType: 'ChainExecutionError',
        errorMessage: e.message,
        timestamp: Date.now()
      }
    };
  }
}
```

### Retry Logic

Retry failed agents with exponential backoff.

```typescript
async executeAgentWithRetry(
  chainId: string,
  agent: ChainAgent,
  prompt: string
): Promise<AgentResult> {
  const maxRetries = agent.retry_count || 3;
  const backoffBase = agent.backoff_base_ms || 1000;
  
  let lastError: Error | null = null;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      return await executeAgent(agent, prompt);
     } catch (e) {
      lastError = e as Error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(backoffBase * Math.pow(2, attempt), 30000);
        await sleep(delay);
        attempt++;
      } else {
        return {
          result: `Failed after ${maxRetries} attempts: ${e.message}`,
          error: e.message
          // No further retries
        };
      }
     }
  }
}
```

### Error Containment Rules

1. ALL errors contained in result
2. NEVER throw chain errors
3. ERROR context logged with timestamp
4. Execution time measured for all runs
5. Error messages sanitized (max 200 chars)

---

## Variable Resolution

### Environment Variables

Resolve `$VAR_NAME` as `process.env.VAR_NAME`.

```yaml
variables:
  WORK_DIR: $WORK_DIR
  REPO_ROOT: $REPO_ROOT
```

### Chain Variables

Refer as `{{var_name}}`.

```yaml
config:
  variables:
    TOPIC: "AI agents"
```

Referenced as: `Analyze {{TOPIC}}`

### Agent Results

Refer as `{{agent_result:N}}` for agent #N output.

```yaml
config:
  variables:
    FIRST_RESULT: "{{agent_result:0}}"
    SECOND_RESULT: "{{agent_result:1}}"
```

### File Content

Refer as `{{file:path}}`.

```yaml
variables:
  README: "{{file:./README.md}}"
```

---

## Extension Points

### Custom Variable Validators

Add validation for chain variables.

```typescript
class ChainValidation {
  private validators: Map<string, (value: string) => boolean> = new Map();
  
  registerValidator(name: string, validator: (value: string) => boolean): void {
    this.validators.set(name, validator);
  }
  
  validate(variables: Record<string, string>): string[] {
    const errors: string[] = [];
    
    for (const [name, value] of Object.entries(variables)) {
      const validator = this.validators.get(name);
      if (validator && !validator(value)) {
        errors.push(`Invalid value for ${name}: ${value}`);
      }
    }
    
    return errors;
  }
}
```

### Custom Context Builders

Implement custom context propagation.

```typescript
class ContextBuilderRegistry {
  private builders: Map<ContextMode, (ctx: ExtensionContext) => string> = new Map();
  
  register(mode: ContextMode, builder: (ctx: ExtensionContext) => string): void {
    this.builders.set(mode, builder);
  }
  
  build(mode: ContextMode, ctx: ExtensionContext): string | null {
    return this.builders.get(mode)?.(ctx) ?? null;
  }
}
```

### Custom Aggregators

Aggregate chain results with custom strategy.

```typescript
class AggregatorRegistry {
  private aggregators: Map<string, (results: AgentResult[]) => string> = new Map();
  
  register(mode: string, aggregator: (results: AgentResult[]) => string): void {
    this.aggregators.set(mode, aggregator);
  }
  
  aggregate(mode: string, results: AgentResult[]): string {
    return this.aggregators.get(mode)?.(results) ?? this.defaultAggregator(results);
  }
  
  private defaultAggregator(results: AgentResult[]): string {
    return results.map(r => `${r.agentType}: ${r.result}`).join('\n');
  }
}
```

### Stream Hooks

Hook into streaming progression.

```typescript
class StreamHookRegistry {
  private hooks: Map<string, (event: ChainEvent) => void> = new Map();
  
  register(hookName: string, callback: (event: ChainEvent) => void): void {
    this.hooks.set(hookName, callback);
  }
  
  emit(hookName: string, event: ChainEvent): void {
    const hook = this.hooks.get(hookName);
    if (hook) {
      hook(event);
    }
  }
}
```

---

## Integration Patterns

### Register Chain Commands

```typescript
function initialize(): void {
  const chainLoader = new ChainLoader();
  chainLoader.loadAll();
  
  const chainRegistry = new ChainRegistry(chainLoader);
  chainRegistry.refresh();
  
  const chainExecutor = new ChainExecutor();
  chainExecutor.setCheckpointManager(checkpointManager);
  
  const adapter = new VirtualAgentAdapter(chainLoader, chainRegistry, chainExecutor);
  
  // Register /chain-name commands
  for (const chain of chainRegistry.listChains()) {
    registerChainCommand(chain);
  }
  
  // Register legacy shim (/run-chain)
  registerLegacyShim();
}
```

### Chain Validation at Startup

```typescript
async initialize(): void {
  const chains = await chainLoader.loadAll();
  
  // Validate
  const { valid, invalid } = chainRegistry.validateAll();
  
  if (invalid.length > 0) {
    console.warn(`[Chain-As-Agent] Invalid chains: ${invalid.map(c => c.name).join(', ')}`);
  }
}
```

### Checkpoint Integration

```typescript
class CheckpointManager {
  async saveCheckpoint(chainId: string, chain: ChainDefinition): Promise<void> {
    const checkpoint = {
      chainId,
      state: 'running',
      timestamp: new Date().toISOString()
    };
    
    // Write atomically
    await fs.writeFile(`${chainId}.tmp`, JSON.stringify(checkpoint));
    await fs.rename(`${chainId}.tmp`, chainId);
  }
}
```

---

## Testing Patterns

### Unit Tests

```typescript
describe('ChainLoader', () => {
  it('loads valid chain YAML', async () => {
    const loader = new ChainLoader();
    loader.loadAll();
    
    const chain = loader.load('research');
    expect(chain).toBeDefined();
    expect(chain.name).toBe('research-chain');
  });
  
  it('returns undefined for missing chain', () => {
    const loader = new ChainLoader();
    const chain = loader.load('nonexistent');
    expect(chain).toBeUndefined();
  });
});
```

### Integration Tests

```typescript
describe('ChainExecutor', () => {
  it('executes chain sequentially', async () => {
    const executor = new ChainExecutor();
    
    const result = await executor.execute(chain, { cwd: process.cwd() }, 'test');
    
    expect(result.success).toBe(true);
    expect(result.metrics.agentsExecuted).toBe(chain.agents.length);
  });
  
  it('contains errors', async () => {
    const executor = new ChainExecutor();
    
    const result = await executor.execute(badChain, { cwd: process.cwd() }, 'test');
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```

### E2E Tests

```typescript
describe('VirtualAgentAdapter', () => {
  it('executes chain via adapter', async () => {
    const adapter = new VirtualAgentAdapter(loader, registry, executor);
    
    const result = await adapter.execute('research', 'Analyze AI');
    
    expect(result.status).toBe('success');
    expect(result.result).toContain('Analyze AI');
  });
});
```

---

## Debugging

### Logs

Chain logs written to `.pi/chains/logs.log`:

```
[ChainLoader] Loaded chain: research-chain
[ChainExecutor] Executing chain: research-chain
[ChainExecutor] Agent 0 (general-purpose) completed
[ChainExecutor] Agent 1 (Plan) completed
[ChainExecutor] Chain complete: research-chain (2500ms)
```

### Debug Mode

Enable debug logging:

```javascript
process.env.CHAIN_DEBUG = 'true';
```

### Debug Commands

```bash
# List chains
chain-list

# Validate chains
chain-validate

# Test execution
chain-test research-chain -- "test"
```

---

## Performance Tips

### Context Size

Limit context to 50k tokens:

```typescript
const contextBudget = 50000;

buildContext(ctx, priorResults) {
  if (estimateTokens(ctx) > contextBudget * 0.9) {
    ctx = truncateTokens(ctx, contextBudget);
  }
  return ctx;
}
```

### Checkpoint Size

Limit checkpoints to 50MB:

```typescript
const MAX_CHECKPOINT_SIZE = 50 * 1024 * 1024;

saveCheckpoint(data) {
  if (JSON.stringify(data).length > MAX_CHECKPOINT_SIZE) {
    throw new Error('Checkpoint exceeds size limit');
  }
}
```

### Agent Timeout

Default 1 minute:

```yaml
timeout_ms: 60000
```

---

## Migration Guide

### From /run-chain

**Old**:
```bash
/run-chain research-chain -- "Analyze"
```

**New**:
```bash
/research-chain -- "Analyze"
```

### Migration Checklist

- [ ] Update documentation examples
- [ ] Update training materials
- [ ] Remove /run-chain references
- [ ] Test both commands work identically
- [ ] Document deprecation timeline

---

## Troubleshooting

### Chain Not Found

**Problem**: Chain command fails

```
Error: Chain "research" not found
```

**Causes**:
- Chain file missing
- Chain name mismatch
- Chain not loaded

**Debug**:
```bash
# Check chain exists
ls .pi/chains/research-chain.yaml

# Check chain name
cat .pi/chains/research-chain.yaml | grep "^name:"
```

### Context Token Error

**Problem**: Context exceeds budget

```
Error: Context exceeds budget (100k > 50k)
```

**Causes**:
- Large context passed
- Context not compressed
- Missing compression

**Fix**:
```yaml
context_mode: inherit_compact   # Compress context
```

### Chain Timeout

**Problem**: Chain times out

```
Timeout after 60000ms
```

**Causes**:
- Agent execution slow
- Timeout too short
- Resource contention

**Fix**:
```yaml
timeout_ms: 120000   # Longer timeout
```

---

## Contributing

### How to Add a Chain

1. Create `.pi/chains/my-chain.yaml`
2. Define chain YAML:

```yaml
name: my-chain
displayName: "My Chain"
description: "My chain description"
version: "1.0"

agents:
  - agent_type: general-purpose
    prompt: "Chain task"

```

3. Execute chain:
```bash
/my-chain -- "prompt"
```

### How to Extend ChainLoader

1. Override `ChainLoader.load()`
2. Override `ChainLoader.validate()`
3. Override `ChainLoader.initialize()`

### How to Add Chain Executor

1. Extend `ChainExecutor.execute()`
2. Override context building
3. Add custom error handling
4. Implement checkpoint save/load

---

## References

- [Architecture Guide](./architecture.md)
- [User Guide](./user-guide.md)
- Chain Loader API docs
- Chain Registry API docs
- Chain Executor API docs
- Virtual Agent Adapter API docs

---

*Developer Guide v1.0*  
*Last Updated: 2026-01-15*
