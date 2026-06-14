# Agent Orchestration Model

## Mission

Implement the requirements defined in:

```text
SPEC.md
```

using the workflow defined in this file.

All work must prioritize:

- maintainability
- production readiness
- backward compatibility
- observability
- extensibility

---

# Constraints

Installed:

```text
@tintinweb/pi-subagents
@tintinweb/pi-tasks
```

Not Installed:

```text
pi-subagents
```

Never:

- install pi-subagents
- add pi-subagents as a dependency
- fork pi-subagents
- replace Tintinweb execution logic

The implementation must extend the existing architecture of:

```text
@tintinweb/pi-subagents
```

---

# Source of Truth

Requirements:

```text
SPEC.md
```

Workflow:

```text
AGENTS.md
```

Execution Roadmap:

```text
TODO.md
```

Live Progress Tracking:

```text
@tintinweb/pi-tasks
```

If conflicts exist:

1. SPEC.md defines what to build
2. AGENTS.md defines how to build it
3. TODO.md defines execution phases
4. pi-tasks defines current execution state

---

## Orchestrator

Primary Agent:

- delegate

Responsibilities:

- break work into sub-tasks
- assign tasks to specialists
- collect outputs
- consolidate findings
- enforce workflow order
- manage task lifecycle
- coordinate approvals

The delegate agent MUST NOT perform implementation work directly.

Its purpose is orchestration.

---

# Mandatory Workflow

All work MUST follow the sequence below.

No phase may be skipped.

No implementation may begin before Architecture Review is complete.

---

## Phase 1 - Repository Discovery

### Agents

- scout
- context-builder

### Outputs

```text
context.md
artifacts/research/repository-analysis.md
```

### Responsibilities

- inspect repository
- identify architecture
- identify extension points
- identify command registration
- identify execution flow
- inspect installed @tintinweb/pi-subagents implementation
- identify integration risks

### Exit Criteria

- architecture documented
- extension points identified
- risks documented

---

## Phase 2 - External Research

### Agents

- researcher

### Inputs

```text
context.md
```

### Outputs

```text
research.md
artifacts/research/external-research.md
```

### Research Topics

- @tintinweb/pi-subagents architecture
- chain execution patterns
- command alias patterns
- virtual agent patterns
- agent orchestration patterns
- extension mechanisms
- compatibility considerations

### Responsibilities

- gather external context
- identify best practices
- identify similar implementations
- identify risks

### Exit Criteria

- research complete
- findings documented

---

## Phase 3 - Planning

### Agents

- planner
- business-analyst

### Inputs

```text
context.md
research.md
```

### Outputs

```text
plan.md
artifacts/planning/implementation-plan.md
```

### Responsibilities

- create implementation roadmap
- define milestones
- define acceptance criteria
- define task breakdown
- define testing strategy
- define rollback strategy

### Exit Criteria

- implementation plan approved

---

## Phase 4 - Architecture Review

### Agents

- oracle
- reviewer

### Inputs

```text
context.md
research.md
plan.md
```

### Outputs

```text
artifacts/architecture/architecture-review.md
```

### Responsibilities

- challenge assumptions
- validate consistency
- identify hidden risks
- prevent architectural drift
- validate integration strategy

### Exit Criteria

- architecture approved

### Rule

Implementation is forbidden until this review is complete.

---

## Phase 5 - Platform Review

### Agents

- platform-engineer
- aws-architect
- kubernetes-engineer

### Outputs

```text
artifacts/architecture/platform-review.md
```

### Responsibilities

- review runtime impact
- review scalability
- review observability
- review operational impact
- review maintainability
- review upgrade compatibility

### Exit Criteria

- platform impact approved

Required for all runtime modifications.

---

## Phase 6 - Implementation

### Agents

- software-engineer
- worker

### Inputs

```text
context.md
plan.md
```

### Responsibilities

- implement approved plan
- preserve compatibility
- create tests
- create migration support
- implement documentation stubs

### Forbidden

- changing requirements
- redesigning architecture
- bypassing review decisions

### Outputs

```text
source code
tests
progress.md
```

### Exit Criteria

- implementation complete
- tests created

---

## Phase 7 - Validation

### Agents

- quality-engineer
- reviewer

### Outputs

```text
artifacts/validation/test-report.md
```

### Responsibilities

- requirement validation
- regression testing
- compatibility validation
- security review
- operational readiness validation

### Exit Criteria

- validation complete

---

## Phase 8 - Documentation

### Agents

- documenter

### Outputs

```text
docs/
```

### Responsibilities

- update docs
- update migration guide
- update architecture guide
- update developer guide
- update user guide

### Exit Criteria

- documentation complete

---

# Final Approval Chain

Required reviewers:

1. reviewer
2. oracle
3. quality-engineer

All three approvals are required before completion.

Outputs:

```text
artifacts/final-approval.md
```

---

# Delegation Rules

The delegate agent should use:

- scout for repository reconnaissance
- context-builder for context generation
- researcher for external research
- planner for implementation plans
- business-analyst for requirements analysis
- oracle for decision validation
- reviewer for critical review
- platform-engineer for platform concerns
- aws-architect for cloud architecture concerns
- kubernetes-engineer for orchestration concerns
- software-engineer for implementation
- worker for implementation support
- quality-engineer for validation
- documenter for documentation

The delegate agent is responsible for coordinating all specialist agents.

---

# Task Management Requirements

The project uses:

```text
@tintinweb/pi-tasks
```

as the authoritative task tracking system.

---

## Before Starting Any Phase

The delegate agent must:

1. Verify the phase task exists.
2. Create missing tasks.
3. Create required subtasks.
4. Associate expected deliverables.
5. Move the phase task to:

```text
IN_PROGRESS
```

---

## During Execution

The active agent must:

1. Update progress.
2. Record discoveries.
3. Record blockers.
4. Record implementation notes.
5. Link generated artifacts.
6. Keep task state synchronized.

---

## After Completion

The delegate agent must:

1. Verify deliverables exist.
2. Verify outputs were generated.
3. Update completion notes.
4. Link generated artifacts.
5. Move the task to:

```text
DONE
```

---

## Required Top-Level Tasks

The delegate agent must ensure the following tasks exist:

```text
Phase 1 - Repository Discovery
Phase 2 - External Research
Phase 3 - Planning
Phase 4 - Architecture Review
Phase 5 - Platform Review
Phase 6 - Implementation
Phase 7 - Validation
Phase 8 - Documentation
```

Subtasks should be created whenever useful.

Example:

```text
Phase 6 - Implementation
├─ Implement command registration
├─ Implement chain resolver
├─ Implement virtual agent adapter
├─ Implement chain executor
├─ Implement context propagation
├─ Implement streaming support
├─ Implement retries
└─ Implement validation
```

---

## Allowed Status Transitions

```text
TODO
  ↓
IN_PROGRESS
  ↓
REVIEW
  ↓
DONE
```

Blocked work:

```text
BLOCKED
```

must include a reason.

---

# Artifact Tracking

All generated artifacts must be linked to the corresponding task.

Examples:

```text
context.md
research.md
plan.md

artifacts/research/*
artifacts/planning/*
artifacts/architecture/*
artifacts/validation/*
```

---

# Coding Standards

Requirements:

- strict typing
- production-ready code
- modular architecture
- no unnecessary abstractions
- maintain backward compatibility
- preserve existing APIs
- write tests with implementation
- document public interfaces

---

# Review Requirements

Every implementation must be reviewed by:

```text
reviewer
```

Every architectural decision must be reviewed by:

```text
oracle
```

Every release candidate must be validated by:

```text
quality-engineer
```

---

# Completion Rule

A phase is not complete until:

- deliverables exist
- artifacts were generated
- required reviews completed
- task status is DONE
- completion notes recorded

The delegate agent may not proceed to the next phase until all completion requirements are satisfied.

---

# Success Criteria

The implementation is successful when:

A chain such as:

```yaml
chains:
  architecture-review:
    agents:
      - scout
      - planner
      - oracle
      - reviewer
```

automatically becomes:

```bash
/architecture-review -- Analyze repository
```

while preserving compatibility with:

```bash
/run-chain architecture-review -- Analyze repository
```

and maintaining native @tintinweb/pi-subagents behavior.