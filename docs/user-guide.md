# Chain-as-Agent Extension - User Guide

**Version**: 1.0  
**Last Updated**: 2026-01-15

---

## Overview

The Chain-as-Agent extension allows you to execute multi-agent workflows as simple chain commands. Instead of running:

```bash
/run-chain security-review -- Review this repository
```

You can now execute the same chain with:

```bash
/security-review -- Review this repository
```

Chains execute with the same UX, streaming behavior, and output formatting as native chain commands.

---

## Quick Start

### 1. Create Your First Chain

Create a file at `.pi/chains/research.yaml`:

```yaml
name: research
displayName: "Research Workflow"
description: "Multi-agent research chain"

agents:
  - agent_type: general-purpose
    prompt: "Research the following topic and summarize key findings"
    context_mode: inherit_compact
    timeout_ms: 60000
   
  - agent_type: Plan
    prompt: "Based on findings, create an analysis plan"
    context_mode: inherit
    timeout_ms: 120000
   
  - agent_type: general-purpose
    prompt: "Execute the plan and produce final report"
    context_mode: inherit_compact
    timeout_ms: 60000

config:
  max_total_turns: 100
  streaming: true
  aggregate_mode: sequential
  on_failure: continue
```

### 2. Execute Your Chain

```bash
research -- "Analyze the current state of AI in software engineering"
```

The chain will:
1. Execute `research` agent
2. Execute `Plan` agent
3. Execute final `general-purpose` agent
4. Aggregate results

### 3. View Available Chains

```bash
/help
```

Shows all available chains:

```text
Chains
-------
/research
/architecture-review
/security-review
```

---

## Chain Syntax

### Basic Command Format

```bash
/<chain-name> -- <prompt>
```

- `<chain-name>`: Chain ID (from `.pi/chains/*.yaml`)
- `<prompt>`: User prompt to pass to first agent

### Alternative Syntax

```bash
/run-chain <chain-name> -- <prompt>
```

Legacy command still works (deprecated).

### Examples

```bash
research -- "Analyze competitor websites"
architecture-review -- "Review codebase structure"
security-review -- "Assess security posture"
```

---

## Chain Configuration

### Context Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `inherit` | Full conversation history | Complex multi-step tasks |
| `inherit_compact` | Compressed context | Balance efficiency & context |
| `inherit_prompt_only` | First prompt only | Stateless execution |
| `none` | Fresh context | Independent tasks |

Example:

```yaml
agents:
  - agent_type: researcher
    context_mode: inherit    # Full context
   
  - agent_type: analyst
    context_mode: inherit_compact  # Compressed
   
  - agent_type: summarizer
    context_mode: none  # No prior context
```

### Error Handling

| Mode | Behavior |
|------|----------|
| `continue` | Skip failing agent, continue |
| `stop` | Halt chain on error |
| `fallback` | Execute alternate chain |

Example:

```yaml
config:
  on_failure: continue  # Chain continues even if agents fail

# Or with fallback chain
config:
  on_failure: fallback
  fallback_chain: simple-review  # Alternative chain
```

### Timeout Configuration

Per-agent timeout:

```yaml
agents:
  - agent_type: researcher
    prompt: "Research topic"
    timeout_ms: 60000  # 1 minute
```

Chain-wide timeout:

```yaml
config:
  max_total_turns: 100  # Stop after 100 turns
```

### Retry Configuration

Retry failed agents:

```yaml
agents:
  - agent_type: researcher
    prompt: "Research topic"
    retry_count: 3  # Retry up to 3 times
    backoff_base_ms: 1000  # 1 second base backoff
```

---

## Variable Patterns

### Environment Variables

```yaml
variables:
  WORK_DIR: $WORK_DIR
  REPO_ROOT: $REPO_ROOT
```

Resolved as: `process.env.$WORK_DIR`

### Chain Variables

```yaml
config:
  variables:
    CHAIN_NAME: research
    EXECUTION_DATE: 2026-01-15
```

Referenced as: `{{CHAIN_NAME}}`

### File Content

```yaml
config:
  variables:
    README_CONTENT: "{{file:./README.md}}"
    CONFIG_CONTENT: "{{file:./config.yaml}}"
```

Resolved as: File path content

### Agent Results

```yaml
config:
  variables:
    AGENT_0_RESULT: "{{agent_result:0}}"
    AGENT_1_RESULT: "{{agent_result:1}}"
```

Resolved as: Output from agent #0, agent #1

---

## Advanced Features

### Streaming Output

Enable progressive output:

```yaml
config:
  streaming: true
```

Output:

```
[researcher]
Researching...

[agent_results]
Findings: AI is improving...

[analyst]
Analyzing findings...
```

### Parallel Execution

Execute agents in parallel:

```yaml
config:
  aggregate_mode: parallel
```

Note: Agents must not have dependencies.

### Smart Aggregation

Auto-detect best mode:

```yaml
config:
  aggregate_mode: smart  # Auto-select mode
```

---

## Command Examples

### Simple Research Chain

```yaml
name: quick-research
displayName: "Quick Research"
description: "Simple research workflow"

agents:
  - agent_type: general-purpose
    context_mode: inherit_compact
    prompt: "Research: {{TOPIC}}"
    timeout_ms: 30000

config:
  variables:
    TOPIC: "software engineering"
```

Execute:
```bash
quick-research -- "AI trends in 2026"
```

### Multi-Step Workflow

```yaml
name: code-review
displayName: "Code Review Pipeline"
description: "Automated code review"

agents:
  - agent_type: Explore
    prompt: "Identify TODO comments in codebase"
    context_mode: none
   
  - agent_type: Plan
    prompt: "Prioritize TODO items by impact"
    context_mode: inherit
   
  - agent_type: general-purpose
    prompt: "Execute improvements for top items"
    context_mode: inherit_compact

config:
  on_failure: stop
  max_total_turns: 50
```

Execute:
```bash
code-review -- "Review src/ directory"
```

### Research Pipeline

```yaml
name: research-pipeline
displayName: "Research Pipeline"
description: "Multi-agent research workflow"

agents:
  - agent_type: general-purpose
    prompt: "Research: {{TOPIC}}"
    context_mode: inherit_compact
   
  - agent_type: general-purpose
    prompt: "Research follow-up: {{FOLLOW_UP}}"
    context_mode: inherit_compact
   
  - agent_type: Plan
    prompt: "Synthesize findings into report"
    context_mode: inherit

config:
  streaming: true
```

Execute:
```bash
research-pipeline -- "AI agents in software engineering"
```

---

## Troubleshooting

### Chain Not Found

**Problem**: Chain command fails

```bash
$ unknown-chain -- "test"
Error: Chain "unknown-chain" not found
```

**Solution**:
1. Check chain file exists: `.pi/chains/unknown-chain.yaml`
2. Verify chain name matches YAML `name:` field
3. List available chains: `/help`

---

### Chain Timeout

**Problem**: Chain execution times out

```bash
$ analysis-chain -- "test"
Timeout after 60000ms
```

**Solution**:
1. Increase agent timeout: `timeout_ms: 120000`
2. Increase chain limit: `max_total_turns: 200`
3. Check agent execution issues

---

### Context Error

**Problem**: Chain fails due to context limits

```bash
Error: Context size exceeds budget (100000 tokens > 50000)
```

**Solution**:
1. Use `inherit_compact` mode
2. Use `none` mode for independent tasks
3. Compress prompts
4. Reduce context size

---

### Agent Missing

**Problem**: Chain references non-existent agent

```bash
$ test-chain -- "test"
Error: Agent "missing-agent" not found
```

**Solution**:
1. Check agent files exist: `~/.pi/agent/agents/`
2. Check agent names match
3. List available agents: `/help`

---

### Circular Dependency

**Problem**: Chain has circular dependencies

```bash
Error: Circular dependency: chain-a → chain-b → chain-a
```

**Solution**:
1. Check chain YAML for circular references
2. Remove circular agent references
3. Validate chains at startup

---

## Migration from /run-chain

### Legacy Syntax

```bash
/run-chain chain-name -- "prompt"
```

### Migrated Syntax

```bash
/chain-name -- "prompt"
```

### Compatibility

- Both commands work identically
- `/run-chain` deprecated (warning shown)
- Migration recommended

### Migration Steps

1. Update documentation with `/chain-name` examples
2. Update training materials
3. Remove `/run-chain` references at v0.13

---

## Tips & Best Practices

### 1. Start Simple

Create chains with 2-3 agents initially:

```yaml
agents:
  - agent_type: general-purpose
    context_mode: inherit_compact
   
  - agent_type: Plan
    context_mode: inherit
```

### 2. Use inherit_compact

Most chains benefit from compressed context:

```yaml
context_mode: inherit_compact  # Recommended default
```

### 3. Set Reasonable Timeouts

```yaml
timeout_ms: 60000  # 1 minute (good default)
```

### 4. Enable Streaming

```yaml
streaming: true  # Best UX
```

### 5. Handle Errors Gracefully

```yaml
on_failure: continue  # Most chains continue on failure
```

### 6. Use Variables

```yaml
config:
  variables:
    TOPIC: "software engineering"
```

Referenced as: `{{TOPIC}}`

---

## Security Considerations

### Input Validation

- Chain names validated (alphanumeric, no spaces)
- Agent names validated (must exist)
- Chain definitions validated at load time

### Error Containment

- No stack traces to users
- Messages sanitized
- Failures contained in result

### Context Isolation

- Agent contexts isolated
- Context sizes bounded
- Memory monitored

---

## Configuration File Reference

### Complete Chain YAML

```yaml
name: research-workflow
displayName: "Research Workflow"
description: "Multi-agent research chain"
version: "1.0"

agents:
  - agent_type: general-purpose
    prompt: "Research: {{TOPIC}}"
    context_mode: inherit_compact
    stop_on_error: false
    timeout_ms: 60000
    retry_count: 3
   
  - agent_type: Plan
    prompt: "Analyze findings and plan next steps"
    context_mode: inherit
    stop_on_error: false
    timeout_ms: 120000
    retry_count: 3

config:
  max_total turns: 100
  streaming: true
  aggregate_mode: sequential
  on_failure: continue
  variables:
    TOPIC: "AI agents"

metadata:
  author: "team"
  tags: ["research", "analysis"]
```

---

## Getting Help

### List Chains

```bash
/help
```

Shows all available chain commands.

### Chain Help

```bash
/chain-name -- "--help"
```

Shows chain-specific help.

### Logs

```bash
# View chain logs
cat ~/.pi/chains/logs.log
```

---

## Examples Directory

Example chains available in `.pi/chains/`:

- `chain-example.yaml` - Simple example chain
- `research-pipeline.yaml` - Multi-agent research
- `code-review.yaml` - Code review workflow

See examples/ directory for complete samples.

---

## Next Steps

1. Create your first chain
2. Execute chains using `/chain-name`
3. Customize chain configuration
4. Add advanced features (streaming, retries)
5. Migrate from `/run-chain`

For more advanced features, see:
- Architecture Guide
- Developer Guide

---

*User Guide v1.0*  
*Last Updated: 2026-01-15*
