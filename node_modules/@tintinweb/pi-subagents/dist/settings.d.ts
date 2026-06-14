import type { JoinMode } from "./types.js";
export interface SubagentsSettings {
    maxConcurrent?: number;
    /**
     * 0 = unlimited — the extension's single source of truth for that convention:
     * `normalizeMaxTurns()` in agent-runner.ts treats 0 → `undefined`, and the
     * `/agents` → Settings input prompt explicitly says "0 = unlimited".
     */
    defaultMaxTurns?: number;
    graceTurns?: number;
    defaultJoinMode?: JoinMode;
    /**
     * Master switch for the schedule subagent feature. Defaults to `true`.
     * When `false`: the `Agent` tool's `schedule` param + its guideline are
     * stripped from the tool spec at registration (zero LLM-context cost), the
     * scheduler doesn't bind to the session, and the `/agents → Scheduled jobs`
     * menu entry is hidden. Schema-level removal applies at extension load
     * (next pi session); runtime menu/runtime-fire short-circuit is immediate.
     */
    schedulingEnabled?: boolean;
    /**
     * When true, the effective model of each subagent spawn is validated
     * against `enabledModels` from pi's settings — both global
     * (`<agentDir>/settings.json`) and project-local (`<cwd>/.pi/settings.json`),
     * with project overriding global (mirrors pi's SettingsManager deep-merge).
     *
     * scopeModels guards against runtime LLM choices, not user-level config.
     * Out-of-scope handling reflects this:
     *   - Caller-supplied via `Agent({ model: "..." })` (only when frontmatter
     *     has no `model:`, since frontmatter is authoritative): hard error
     *     returned to the orchestrator, listing the allowed models. The LLM
     *     made an explicit out-of-scope choice and gets explicit feedback.
     *   - Frontmatter-pinned: warning toast + the pinned model runs. The
     *     agent's author/installer chose this; trust it.
     *   - Parent-inherited (neither caller nor frontmatter sets a model):
     *     warning toast + parent's model runs. The user chose the parent's
     *     model when starting the session; trust it.
     *
     * No-op when pi's `enabledModels` is empty or absent — nothing to validate
     * against. Defaults to false: subagents may use any model.
     */
    scopeModels?: boolean;
    /**
     * When true, the three built-in default agents (general-purpose, Explore, Plan)
     * are not registered at startup. User-defined agents from .pi/agents/*.md are
     * completely unaffected — only the hardcoded DEFAULT_AGENTS are suppressed.
     * Defaults to false.
     */
    disableDefaultAgents?: boolean;
    /**
     * Which Agent tool description the LLM sees. "full" (default) is the rich
     * Claude Code-style prompt; "compact" is a ~75% smaller version (one-line
     * agent type list, terse usage notes) for small/local models where tool-spec
     * tokens are expensive; "custom" reads `.pi/agent-tool-description.md`
     * (project, falling back to `<agentDir>/agent-tool-description.md`) with
     * `{{placeholder}}` substitution — a missing/empty file falls back to "full".
     * The mode is read once at tool registration — changing it applies on the
     * next pi session.
     */
    toolDescriptionMode?: ToolDescriptionMode;
}
export type ToolDescriptionMode = "full" | "compact" | "custom";
/** Setter hooks used by applySettings to wire persisted values into in-memory state. */
export interface SettingsAppliers {
    setMaxConcurrent: (n: number) => void;
    setDefaultMaxTurns: (n: number) => void;
    setGraceTurns: (n: number) => void;
    setDefaultJoinMode: (mode: JoinMode) => void;
    setSchedulingEnabled: (b: boolean) => void;
    setScopeModels: (enabled: boolean) => void;
    setDisableDefaultAgents: (b: boolean) => void;
    setToolDescriptionMode: (mode: ToolDescriptionMode) => void;
}
/** Emit callback — a subset of `pi.events.emit` to keep helpers testable. */
export type SettingsEmit = (event: string, payload: unknown) => void;
/** Load merged settings: global provides defaults, project overrides. */
export declare function loadSettings(cwd?: string): SubagentsSettings;
/**
 * Write project-local settings. Global is never touched from code.
 * Returns `true` on success, `false` if the write (or mkdir) failed so the
 * caller can surface a warning — persistence isn't fatal but isn't silent.
 */
export declare function saveSettings(s: SubagentsSettings, cwd?: string): boolean;
/** Apply persisted settings to the in-memory state via caller-supplied setters. */
export declare function applySettings(s: SubagentsSettings, appliers: SettingsAppliers): void;
/**
 * Format the user-facing toast for a settings mutation. Pure function —
 * routes the success/failure of `saveSettings` into the right message + level
 * so the UI layer (index.ts) stays a thin wire between input and notification.
 */
export declare function persistToastFor(successMsg: string, persisted: boolean): {
    message: string;
    level: "info" | "warning";
};
/**
 * Load merged settings, apply them to in-memory state, and emit the
 * `subagents:settings_loaded` lifecycle event. Returns the loaded settings so
 * callers can log/inspect. Extension init wires this once.
 */
export declare function applyAndEmitLoaded(appliers: SettingsAppliers, emit: SettingsEmit, cwd?: string): SubagentsSettings;
/**
 * Persist a settings snapshot, emit the `subagents:settings_changed` event
 * (regardless of persist outcome so listeners see the in-memory change), and
 * return the toast the UI should display. Event payload carries the `persisted`
 * flag so listeners can react to write failures.
 */
export declare function saveAndEmitChanged(snapshot: SubagentsSettings, successMsg: string, emit: SettingsEmit, cwd?: string): {
    message: string;
    level: "info" | "warning";
};
