# Chain-as-Native-Command Extension for @tintinweb/pi-subagents

## Mission

Design and implement a production-ready extension that adds native chain execution capabilities to the existing:

```text
@tintinweb/pi-subagents
```

installation.

The objective is to make chains behave exactly like native Tintinweb agents.

Instead of:

```bash
/run-chain architecture-review -- Analyze this repository
```

the user should be able to invoke:

```bash
/architecture-review -- Analyze this repository
```

and have the chain executed transparently using the same execution model, UX, lifecycle, context handling, streaming behavior, and output formatting used by Tintinweb subagents.

---

# Critical Constraint

The extension:

```text
@tintinweb/pi-subagents
```

is already installed and is the only subagent framework available.

The extension:

```text
pi-subagents
```

is NOT installed and MUST NOT be added as a dependency.

The implementation may study and reuse concepts, workflows, UX patterns, and ideas from:

```text
https://pi.dev/packages/pi-subagents
```

but must NOT depend on it at runtime.

No code should assume that pi-subagents is installed.

---

# Project Objective

Implement a Chain-as-Agent architecture where every chain is dynamically transformed into a virtual Tintinweb-compatible agent.

The user should never need to know whether they are executing:

- an agent
- a chain
- a workflow
- a multi-agent pipeline

Everything should appear and behave identically.

---

# Desired User Experience

## Current

```bash
/run-chain security-review -- Review this repository
```

## Desired

```bash
/security-review -- Review this repository
```

Example:

```yaml
chains:
  security-review:
    description: Security assessment workflow

    agents:
      - repo-analyzer
      - threat-modeler
      - security-auditor
      - remediation-planner
```

The chain above should automatically become:

```bash
/security-review
```

without requiring:

```bash
/run-chain security-review
```

---

# Implementation Philosophy

Treat the project as:

```text
Chain Functionality for Tintinweb
```

not:

```text
Integration of Two Extensions
```

The goal is to recreate the chain capabilities inspired by pi-subagents while leveraging the existing execution engine provided by:

```text
@tintinweb/pi-subagents
```

---

# Non-Goals

Do NOT:

- install pi-subagents
- add pi-subagents as a dependency
- fork pi-subagents
- require additional user installations
- replace Tintinweb execution logic
- duplicate existing agent functionality
- create a parallel execution framework

Avoid solutions that create maintenance burden when:

```text
@tintinweb/pi-subagents
```

is upgraded.

---

# Required Architecture

The chain system should be a lightweight orchestration layer.

```text
User
 │
 ▼
/architecture-review
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
@tintinweb/pi-subagents
 │
 ▼
Agent Execution
```

The execution of individual agents must remain delegated to:

```text
@tintinweb/pi-subagents
```

whenever possible.

---

# Research Phase (Mandatory)

Before implementing anything:

## Step 1: Repository Inspection

Inspect the installed:

```text
@tintinweb/pi-subagents
```

codebase.

Identify:

- command registration
- command routing
- agent registration
- execution lifecycle
- context propagation
- output rendering
- streaming support
- event hooks
- telemetry hooks
- extension points

---

## Step 2: Architecture Documentation

Produce:

```text
docs/tintinweb-analysis.md
```

containing:

- architecture overview
- extension opportunities
- constraints
- risks
- proposed integration strategy

---

## Step 3: Design Validation

Validate that:

- virtual agents can be registered
- command aliases can be created
- agent execution can be orchestrated externally
- chain context can be injected

---

## Step 4: Implementation Plan

Produce:

```text
docs/implementation-plan.md
```

before writing code.

---

# High-Level Flow

```text
User
 │
 ▼
/security-review
 │
 ▼
Command Router
 │
 ├─ Native Agent?
 │      └─ Execute
 │
 ├─ Chain Agent?
 │      └─ Execute Chain
 │
 └─ Built-in Command?
        └─ Execute
```

---

# Functional Requirements

## Requirement 1: Dynamic Command Registration

At startup:

```text
Load Agents
Load Chains
Generate Virtual Agents
Register Commands
```

Example:

```yaml
chains:
  architecture-review:
    description: Architecture Review Workflow

    agents:
      - repo-analyzer
      - architect
      - oracle
      - reviewer
```

Automatically exposes:

```bash
/architecture-review
```

without manual registration.

---

## Requirement 2: Command Discovery

The following command:

```bash
/help
```

must show:

```text
Agents
-------
/research
/reviewer
/oracle

Chains
-------
/architecture-review
/security-review
/release-readiness
```

Chains must be discoverable exactly like agents.

---

## Requirement 3: Tintinweb-Compatible Execution

Execution behavior must match native Tintinweb agents.

Preserve:

- lifecycle hooks
- streaming
- retries
- metadata
- artifacts
- logs
- execution state
- event hooks
- telemetry

Internally:

```yaml
agents:
  - repo-analyzer
  - architect
  - oracle
  - reviewer
```

must behave as if the user executed:

```bash
/repo-analyzer
/architect
/oracle
/reviewer
```

sequentially.

---

## Requirement 4: Context Propagation

Each agent receives:

```json
{
  "original_prompt": "...",
  "chain_name": "...",
  "previous_output": "...",
  "accumulated_context": "...",
  "execution_metadata": {}
}
```

Flow:

```text
User Prompt
     │
     ▼
repo-analyzer
     │
     ▼
architect
     │
     ▼
oracle
     │
     ▼
reviewer
```

Each step receives:

- original prompt
- previous output
- accumulated context
- chain metadata

---

## Requirement 5: Native Command Resolution

Resolution order:

```text
1. Native Agent
2. Virtual Chain Agent
3. Built-in PI Command
```

Example:

```bash
/security-review
```

Resolution:

```text
Find Agent?
No

Find Chain?
Yes

Execute Chain
```

---

## Requirement 6: Chain Definition Format

Support:

```yaml
chains:
  architecture-review:
    description: Full architecture review workflow

    agents:
      - repo-analyzer
      - architect
      - oracle
      - reviewer
```

Advanced:

```yaml
chains:
  security-review:
    description: Security assessment workflow

    agents:
      - repo-analyzer
      - threat-modeler
      - security-auditor
      - remediation-planner

    options:
      stream: true
      fail_fast: false
      preserve_context: true
      max_retries: 2
```

---

## Requirement 7: Virtual Agent Adapter

Implement:

```typescript
export class ChainAgentAdapter {
  readonly name: string;
  readonly description: string;

  constructor(
    private readonly chain: ChainDefinition
  ) {}

  async execute(
    prompt: string,
    context: ExecutionContext
  ) {
    return chainExecutor.run(
      this.chain,
      prompt,
      context
    );
  }
}
```

The command registry must treat:

```text
architecture-review
```

the same as:

```text
architect
```

Both should implement the same interface.

---

## Requirement 8: Streaming Support

Output should stream progressively:

```text
[repo-analyzer]
Analyzing repository...

[architect]
Generating architecture assessment...

[oracle]
Challenging assumptions...

[reviewer]
Producing final report...
```

Do not wait for the full chain to complete.

---

## Requirement 9: Error Handling

### Fail Fast

```yaml
options:
  fail_fast: true
```

Behavior:

```text
Agent Fails
Chain Stops
```

### Continue On Failure

```yaml
options:
  fail_fast: false
```

Behavior:

```text
Agent Fails
Error Recorded
Next Agent Executes
```

---

## Requirement 10: Retry Logic

Support:

```yaml
options:
  max_retries: 3
```

Behavior:

```text
Attempt 1
Failed

Attempt 2
Failed

Attempt 3
Success
```

Retries should use Tintinweb execution semantics.

---

## Requirement 11: Observability

Emit:

### Chain Events

```typescript
chain.started
chain.finished
chain.failed
```

### Step Events

```typescript
chain.step.started
chain.step.finished
chain.step.failed
chain.step.retried
```

### Metrics

Collect:

```text
chain_duration
chain_success_rate
chain_failure_rate

step_duration
step_success_rate
step_failure_rate

retry_count
```

---

## Requirement 12: Backward Compatibility

Support:

```bash
/run-chain architecture-review -- Analyze repository
```

and:

```bash
/architecture-review -- Analyze repository
```

Both must use the same executor.

---

# Security Requirements

## Input Validation

Validate:

- chain names
- agent names
- command syntax
- chain definitions

Reject invalid configurations.

---

## Circular Dependency Detection

Prevent:

```yaml
chains:
  chain-a:
    agents:
      - chain-b

  chain-b:
    agents:
      - chain-a
```

Detect cycles at startup.

---

## Agent Existence Validation

Fail startup if:

```yaml
chains:
  review:
    agents:
      - missing-agent
```

references a non-existing agent.

---

# Technical Deliverables

Implement:

```text
src/
├── chain-agent-adapter.ts
├── chain-command-registry.ts
├── chain-command-resolver.ts
├── chain-config-loader.ts
├── chain-context-manager.ts
├── chain-executor.ts
├── chain-streamer.ts
├── chain-events.ts
├── chain-telemetry.ts
├── chain-validator.ts
└── chain-types.ts
```

---

# Testing Requirements

## Unit Tests

Cover:

- command registration
- command resolution
- adapter behavior
- retry logic
- context propagation
- event emission
- validation

---

## Integration Tests

Validate:

```bash
/architecture-review -- test
```

executes:

```text
repo-analyzer
→ architect
→ oracle
→ reviewer
```

in order.

---

## Compatibility Tests

Validate:

```bash
/run-chain architecture-review -- test
```

and

```bash
/architecture-review -- test
```

produce equivalent results.

---

# Documentation Deliverables

Generate:

```text
docs/
├── tintinweb-analysis.md
├── architecture.md
├── implementation-plan.md
├── chain-configuration.md
├── extension-points.md
└── migration-guide.md
```

---

# Acceptance Criteria

## Registration

```bash
/help
```

shows chain commands.

---

## Invocation

The following works:

```bash
/architecture-review -- Analyze repository
```

without requiring:

```bash
/run-chain architecture-review
```

---

## Compatibility

Legacy syntax remains functional.

---

## UX

Chains are indistinguishable from Tintinweb agents.

---

## Execution

Every chain step executes through the native Tintinweb agent execution flow.

---

## Observability

Metrics and events are emitted for:

- chains
- steps
- retries
- failures

---

# Success Definition

A user can define:

```yaml
chains:
  architecture-review:
    agents:
      - repo-analyzer
      - architect
      - oracle
      - reviewer
```

and immediately invoke:

```bash
/architecture-review -- Analyze repository
```

with the same experience, lifecycle, context handling, streaming behavior, output formatting, execution semantics, and observability as any native command provided by:

```text
@tintinweb/pi-subagents
```.
:::
