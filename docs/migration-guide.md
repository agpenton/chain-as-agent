# Chain-as-Agent Extension - Migration Guide

**Version**: 1.0  
**Last Updated**: 2026-01-15

---

## Overview

This migration guide helps users transition from legacy `/run-chain` command to modern `/chain-name` syntax. The migration is designed to be **seamless** - both commands work until the deprecation at v0.13.

---

## Quick Migration

### Before (Legacy)

```bash
/run-chain architecture-review -- "Analyze repository"
```

### After (Modern)

```bash
/architecture-review -- "Analyze repository"
```

### Behavior

Both commands produce **identical results**.

---

## Migration Timeline

| Version | Status | Description |
|---------|--------|-------------|
| **v0.11** | Current | Dual support (`/run-chain` & `/chain-name`) |
| **v0.12** | Deprecation | `/run-chain` shows warning |
| **v0.13** | Removal | `/run-chain` removed |

---

## Step-by-Step Migration

### Step 1: List Current Chains

```bash
/help
```

Shows available chains:

```text
Chains
-------
/architecture-review
/security-review
/release-readiness
```

---

### Step 2: Test New Syntax

```bash
/architecture-review -- "Test prompt"
```

Verify:
- Chain executes
- Output matches `/run-chain`
- Errors match

---

### Step 3: Update Documentation

Update ALL documentation examples:

**Before**:
```bash
/run-chain research-pipeline -- "Analyze"
/run-chain code-review -- "Review"
```

**After**:
```bash
/research-pipeline -- "Analyze"
/code-review -- "Review"
```

---

### Step 4: Update Scripts

Update any automation scripts:

**Before**:
```bash
#!/bin/bash
/run-chain security-review -- "Check"
```

**After**:
```bash
#!/bin/bash
/security-review -- "Check"
```

---

### Step 5: Verify Compatibility

Test both commands produce same output:

```bash
# Legacy
/bin/run-chain test-chain -- "prompt"

# New
/test-chain -- "prompt"

# Verify output identical
```

---

## Migration Checklist

### Immediate Actions

- [ ] Update `/run-chain` to `/chain-name` in documentation
- [ ] Update shell scripts
- [ ] Update CI/CD pipelines
- [ ] Update training materials
- [ ] Test both commands work identically

### Short-Term Actions

- [ ] Remove `/run-chain` references
- [ ] Update all training docs
- [ ] Train team on new syntax
- [ ] Document migration timeline

### Long-Term Actions

- [ ] Remove `/run-chain` (v0.13)
- [ ] Update all automation
- [ ] Remove legacy docs
- [ ] Archive v0.10 chains

---

## Syntax Reference

### Legacy Syntax

```bash
/run-chain <chain-name> -- <prompt>
```

- `/run-chain`: Legacy command
- `<chain-name>`: Chain ID
- `<prompt>`: User prompt

**Example**:
```bash
/run-chain research-chain -- "Analyze AI trends"
```

### Modern Syntax

```bash
/<chain-name> -- <prompt>
```

- `/<chain-name>`: Chain command
- `<prompt>`: User prompt

**Example**:
```bash
/research-chain -- "Analyze AI trends"
```

### Behavior Comparison

| Command | Chain Name | Output | Performance |
|---------|------------|--------|-------------|
| `/run-chain` | `architecture-review` | ✓ Same | Same |
| `/architecture-review` | `architecture-review` | ✓ Same | Same |

---

## Configuration Migration

### Chain Definition Changes

No changes required for existing chains. Chain YAML format unchanged:

```yaml
name: research-chain
displayName: "Research Chain"
description: "Research workflow"

agents:
  - agent_type: general-purpose
    prompt: "Research task"

```

### Variable Patterns

Variables work identically:

```yaml
variables:
  TOPIC: "AI agents"
```

Referenced as: `{{TOPIC}}` - same for both commands

---

## Common Patterns

### Pattern 1: Research Chain

**Before**:
```bash
/run-chain research -- "Analyze AI"
```

**After**:
```bash
/research -- "Analyze AI"
```

### Pattern 2: Review Chain

**Before**:
```bash
/run-chain code-review -- "Review PR"
```

**After**:
```bash
/code-review -- "Review PR"
```

### Pattern 3: Analysis Chain

**Before**:
```bash
/run-chain architecture-review -- "Review structure"
```

**After**:
```bash
/architecture-review -- "Review structure"
```

---

## Migration Scenarios

### Scenario 1: Simple Migration

**Current**: Use `/run-chain` everywhere  
**Goal**: Switch to `/chain-name`  
**Steps**:
1. Replace `/run-chain` with `/chain-name`
2. Update documentation
3. Test both commands

### Scenario 2: Complex Migration

**Current**: Mixed usage in scripts, docs, CI/CD  
**Goal**: Consolidate to `/chain-name`  
**Steps**:
1. Audit all `/run-chain` usage
2. Update each usage to `/chain-name`
3. Test all scripts
4. Remove legacy from docs

### Scenario 3: Production Migration

**Current**: Production using `/run-chain`  
**Goal**: Migrate to `/chain-name`  
**Steps**:
1. Create parallel `/chain-name` commands
2. Run both in parallel
3. Verify identical output
4. Switch to `/chain-name`
5. Archive `/run-chain`

---

## Troubleshooting

### Issue 1: Legacy Command Not Working

**Problem**: `/run-chain` throws error

**Cause**: Command already removed

**Fix**:
```bash
# Use /chain-name instead
/chain-name -- "prompt"
```

### Issue 2: Chain Not Found

**Problem**: Both commands fail

```
Error: Chain not found
```

**Cause**: Chain YAML missing

**Fix**:
```bash
# Check chain exists
ls .pi/chains/chain-name.yaml

# If missing, recreate chain
vi .pi/chains/chain-name.yaml
```

### Issue 3: Output Differs

**Problem**: Commands produce different output

**Cause**: Chain config changed

**Fix**:
```bash
# Check chain YAML
cat .pi/chains/chain-name.yaml

# Verify both use same YAML
```

---

## Backward Compatibility

### Current State

Both commands work identically:

| Command | Status | Notes |
|---------|--------|-------|
| `/run-chain` | Working | Backward compat shim |
| `/chain-name` | Working | Native command |

### Future State

At v0.13:

| Command | Status | Notes |
|---------|--------|-------|
| `/run-chain` | Removed | Error if used |
| `/chain-name` | Only | Native command |

### Migration Window

**v0.11-v0.12**: Dual support with deprecation warning  
**v0.13+**: `/run-chain` removed

---

## Command Equivalence

### Full Equivalence

Both commands execute the same chain, using the same executor, producing identical output.

| Aspect | `/run-chain` | `/chain-name` |
|--------|--------------|---------------|
| Chain Load | Same | Same |
| Chain Config | Same | Same |
| Execution | Same executor | Same executor |
| Output | Identical | Identical |
| Errors | Identical | Identical |
| Context | Same | Same |
| Variables | Same | Same |
| Streaming | Same | Same |

---

## Automation Scripts

### Shell Scripts

**Before**:
```bash
#!/bin/bash
/run-chain research -- "Analyze"
/run-chain review -- "Review"
```

**After**:
```bash
#!/bin/bash
/research -- "Analyze"
/review -- "Review"
```

### YAML Scripts

**Before**:
```yaml
tasks:
  - run: /run-chain research
     args: "Analyze trends"
```

**After**:
```yaml
tasks:
  - run: /research
     args: "Analyze trends"
```

### CI/CD Scripts

**Before**:
```yaml
- name: Run research chain
  run: /run-chain research -- "Analyze repository"
```

**After**:
```yaml
- name: Run research chain
  run: /research -- "Analyze repository"
```

---

## Training Materials

### Training Update Checklist

- [ ] Update command examples
- [ ] Update documentation screenshots
- [ ] Update tutorial videos
- [ ] Update cheat sheets
- [ ] Update quick reference cards

---

## Command Reference

### Legacy Commands

```bash
/run-chain chain-name -- "prompt"
```

### Modern Commands

```bash
/chain-name -- "prompt"
```

### Equivalent Commands

```bash
/run-chain research -- "Analyze"
/research -- "Analyze"

/run-chain code-review -- "Review"
/code-review -- "Review"

/run-chain architecture-review -- "Review"
/architecture-review -- "Review"
```

---

## Deprecation Notice

### v0.12 Deprecation Warning

When using `/run-chain` at v0.12:

```bash
[Chain-As-Agent] /run-chain deprecated
[Chain-As-Agent] Use /chain-name instead
[Chain-As-Agent] /run-chain removed in v0.13
```

### Migration Action Required

```bash
# Upgrade script
chain-migrate --from /run-chain --to /chain-name

# Or manual migration
sed -i 's/run-chain chain-name/chain-name/g' *.bash
sed -i 's/run-chain chain-name/chain-name/g' *.yaml
```

---

## Files to Update

### Documentation
- README.md
- User guide
- Developer guide
- Documentation examples

### Scripts
- Shell scripts (.bash, .sh)
- YAML automation
- CI/CD configs
- Test scripts

### Code
- Agent tools
- Chain loaders
- Custom extensions

---

## Migration Verification

### Verification Steps

1. **Test both commands**
```bash
/run-chain test -- "prompt"
/test -- "prompt"

# Verify identical output
```

2. **Check chain executes**
```bash
# List chains
help

# Verify chain exists
ls .pi/chains/test.yaml
```

3. **Verify errors match**
```bash
# Both should fail identically
/run-chain non-existent -- "test"
/non-existent -- "test"
```

4. **Check streaming**
```bash
# Both should stream identical
/run-chain test -- "prompt"
/test -- "prompt"
```

---

## Migration Timeline

### Phase 1: Current (v0.11)
- Both commands supported
- `/run-chain` works identically
- No migration required yet

### Phase 2: Deprecation (v0.12)
- `/run-chain` shows deprecation warning
- Recommended to migrate
- Migration tools available

### Phase 3: Removal (v0.13)
- `/run-chain` removed
- Error if used
- All use `/chain-name`

---

## Migration Tools

### Manual Migration

```bash
# Find all /run-chain references
grep -r "run-chain" .

# Replace with /chain-name
sed -i 's/run-chain chain-name/chain-name/g' *.bash
sed -i 's/run-chain chain-name/chain-name/g' *.yaml
```

### Automated Migration

```bash
# Migration script
./scripts/migrate-from-run-chain.sh

# Or use chain tool
chain-migrate
```

---

## Examples

### Simple Migration

**Before**:
```bash
/run-chain research -- "Analyze AI"
/run-chain review -- "Review code"
```

**After**:
```bash
/research -- "Analyze AI"
/review -- "Review code"
```

### Complex Migration

**Before**:
```yaml
tasks:
  - run: research
     when: /run-chain research -- "Analyze"
```

**After**:
```yaml
tasks:
  - run: research
     when: /research -- "Analyze"
```

---

## Security Changes

No security changes during migration:

| Security Aspect | Before | After |
|-----------------|--------|-------|
| Input Validation | Same | Same |
| Error Containment | Same | Same |
| Context Isolation | Same | Same |
| Error Containment | Same | Same |

---

## Support

### Migration Support

For migration assistance:
- Check chain documentation
- Contact development team
- Submit issue for migration help

### Common Questions

**Q**: Do I need to migrate immediately?  
**A**: No. `/run-chain` works until v0.13.

**Q**: Will output differ?  
**A**: No. Commands execute identically.

**Q**: How do I migrate all chains?  
**A**: Use `chain-migrate` tool or manual replacement.

---

*Migration Guide v1.0*  
*Last Updated: 2026-01-15*
