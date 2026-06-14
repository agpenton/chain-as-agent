## Research Requirement

Before implementation begins:

1. Inspect the installed `@tintinweb/pi-subagents` implementation.
2. Identify:
   - command registration
   - command routing
   - agent registration
   - execution lifecycle
   - streaming implementation
   - context propagation
   - extension points
3. Document findings.

Implementation must be based on actual repository architecture rather than assumptions.

---

# Integration Strategy

The implementation should be treated as:

```text
Chain Functionality for @tintinweb/pi-subagents
```

not:

```text
Integration of Multiple Extensions
```

The chain system must act as a lightweight orchestration layer on top of the existing Tintinweb agent runtime.

Preferred architecture:

```text
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

Execution of individual agents should remain delegated to the existing Tintinweb runtime whenever possible.

---

# Non-Goals

Do NOT:

- install pi-subagents
- add pi-subagents as a dependency
- fork Tintinweb packages
- replace native command routing
- replace native agent execution
- create a parallel runtime
- introduce breaking changes

---

# Task Management

The implementation process must integrate with:

```text
@tintinweb/pi-tasks
```

Requirements:

- create phase tasks automatically when missing
- update task status during execution
- record progress notes
- record blockers
- attach generated artifacts
- mark completed tasks as DONE

Task tracking is part of the implementation workflow.

---

# Required Deliverables

The project should produce:

```text
context.md
research.md
plan.md
```

Artifacts:

```text
artifacts/research/repository-analysis.md
artifacts/research/external-research.md

artifacts/planning/implementation-plan.md

artifacts/architecture/architecture-review.md
artifacts/architecture/platform-review.md

artifacts/validation/test-report.md

artifacts/final-approval.md
```

Documentation:

```text
docs/architecture.md
docs/user-guide.md
docs/developer-guide.md
docs/migration-guide.md
```

---

# Implementation Success Criteria

The implementation is considered complete only when:

- all acceptance criteria pass
- validation succeeds
- documentation exists
- tasks are marked DONE
- reviewer approval obtained
- oracle approval obtained
- quality-engineer approval obtained

Final approval must be documented in:

```text
artifacts/final-approval.md
```

---

# PROJECT.md Reference

Agents should treat the following as the project summary:

- Implement Chain-as-Agent support for `@tintinweb/pi-subagents`
- Allow `/chain-name -- <prompt>` execution
- Preserve compatibility with `/run-chain <chain-name> -- <prompt>`
- Preserve native execution lifecycle
- Preserve streaming behavior
- Preserve context propagation
- Preserve agent execution semantics
- Preserve backward compatibility
- Use `@tintinweb/pi-tasks` for execution tracking
- Follow AGENTS.md workflow and TODO.md roadmap