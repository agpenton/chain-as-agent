# Project

## Name

Chain-as-Agent Extension for @tintinweb/pi-subagents

## Goal

Allow:

```bash
/<chain-name> -- <prompt>
```

instead of:

```bash
/run-chain <chain-name> -- <prompt>
```

## Constraints

- Use only @tintinweb/pi-subagents
- Do not install pi-subagents
- Do not fork Tintinweb packages
- Preserve backward compatibility

## Success Criteria

- Chains become native commands
- Streaming preserved
- Context propagation preserved
- Native execution lifecycle preserved
- Backward compatibility preserved

## Workflow

See:

- AGENTS.md
- SPEC.md
- TODO.md