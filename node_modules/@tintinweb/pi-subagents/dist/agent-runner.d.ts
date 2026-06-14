/**
 * agent-runner.ts — Core execution engine: creates sessions, runs agents, collects results.
 */
import type { Model } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type AgentSession, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SubagentType, ThinkingLevel } from "./types.js";
/**
 * Tool names registered by THIS extension. Single source of truth so the
 * registration sites (index.ts) and the subagent exclusion list below can't
 * drift apart. These are our own tools, not pi built-ins, so they can't be
 * derived from pi — but they only need defining once.
 */
export declare const SUBAGENT_TOOL_NAMES: {
    readonly AGENT: "Agent";
    readonly GET_RESULT: "get_subagent_result";
    readonly STEER: "steer_subagent";
};
/**
 * Canonical name of an extension for `extensions: [...]` allowlist matching.
 * Lowercased — extension names match case-insensitively so `extensions: [Mcp]`
 * resolves the same as `[mcp]`. Tool names within `ext:foo/bar` are not affected.
 * Directory extensions (`foo/index.ts`) resolve to the parent directory name;
 * single-file extensions to the basename minus `.ts`/`.js`.
 */
export declare function extensionCanonicalName(extPath: string): string;
/**
 * Classify `extensions: string[]` frontmatter entries for the loader-level filter.
 *
 * An entry is a PATH iff it contains a path separator or starts with `~`; otherwise
 * it is a NAME. `"*"` sets the wildcard flag (keep all default-discovered extensions).
 *
 * Path entries are resolved (`~` expanded, made absolute against `cwd`) into `paths`
 * — and their canonical name is also added to `names`. The loader override matches
 * everything by canonical name, so path-loaded extensions are matched via their name
 * rather than their post-staging `Extension.path`.
 */
export declare function parseExtensionsSpec(entries: string[], cwd: string): {
    names: Set<string>;
    paths: string[];
    wildcard: boolean;
};
/**
 * Parse raw `ext:` selector strings (from the `tools:` CSV) into the set of
 * extension names to keep loaded and a per-extension tool-narrowing map.
 *
 * `ext:foo` → `extNames` has `foo`, no narrowing entry (all of foo's tools).
 * `ext:foo/bar` → `extNames` has `foo`, `narrowing.foo` has `bar` (only `bar`).
 * A name lands in `narrowing` only when a `/tool` form is seen, so a bare
 * `ext:foo` alongside `ext:foo/bar` leaves narrowing in effect (narrowing wins).
 * The split is on the first `/`; extension canonical names never contain `/`.
 */
export declare function parseExtSelectors(entries: string[]): {
    extNames: Set<string>;
    narrowing: Map<string, Set<string>>;
};
/** Normalize max turns. undefined or 0 = unlimited, otherwise minimum 1. */
export declare function normalizeMaxTurns(n: number | undefined): number | undefined;
/** Get the default max turns value. undefined = unlimited. */
export declare function getDefaultMaxTurns(): number | undefined;
/** Set the default max turns value. undefined or 0 = unlimited, otherwise minimum 1. */
export declare function setDefaultMaxTurns(n: number | undefined): void;
/** Get the grace turns value. */
export declare function getGraceTurns(): number;
/** Set the grace turns value (minimum 1). */
export declare function setGraceTurns(n: number): void;
/** Info about a tool event in the subagent. */
export interface ToolActivity {
    type: "start" | "end";
    toolName: string;
}
export interface RunOptions {
    /** ExtensionAPI instance — used for pi.exec() instead of execSync. */
    pi: ExtensionAPI;
    /** Manager-assigned id; suffixes session name to disambiguate parallel spawns (e.g. `Explore#a1b2c3d4`). */
    agentId?: string;
    model?: Model<any>;
    maxTurns?: number;
    signal?: AbortSignal;
    isolated?: boolean;
    inheritContext?: boolean;
    thinkingLevel?: ThinkingLevel;
    /** Override working directory (e.g. for worktree isolation). */
    cwd?: string;
    /**
     * Where .pi config is discovered (project extensions, skills, pi settings,
     * agent memory). Default: same as the working directory. The manager sets
     * this to the parent session's cwd when `SpawnOptions.cwd` points the
     * working directory elsewhere — the agent works *there* but carries the
     * parent project's config (the target's `.pi` extensions never execute).
     *
     * WARNING for future callers: if you pass `cwd` pointing at a directory the
     * user didn't open, you almost certainly must pass `configCwd` too —
     * omitting it makes the target's `.pi` extensions execute in this process.
     * (Worktree isolation is the one intentional exception: its copy IS the
     * parent's repo, so config resolving inside it is correct.)
     */
    configCwd?: string;
    /** Called on tool start/end with activity info. */
    onToolActivity?: (activity: ToolActivity) => void;
    /** Called on streaming text deltas from the assistant response. */
    onTextDelta?: (delta: string, fullText: string) => void;
    onSessionCreated?: (session: AgentSession) => void;
    /** Called at the end of each agentic turn with the cumulative count. */
    onTurnEnd?: (turnCount: number) => void;
    /**
     * Called once per assistant message_end with that message's usage delta.
     * Lets callers maintain a lifetime accumulator that survives compaction
     * (which replaces session.state.messages and resets stats-derived sums).
     */
    onAssistantUsage?: (usage: {
        input: number;
        output: number;
        cacheWrite: number;
    }) => void;
    /**
     * Called when the session successfully compacts. `tokensBefore` is upstream's
     * pre-compaction context size estimate. Aborted compactions don't fire.
     */
    onCompaction?: (info: {
        reason: "manual" | "threshold" | "overflow";
        tokensBefore: number;
    }) => void;
}
export interface RunResult {
    responseText: string;
    session: AgentSession;
    /** True if the agent was hard-aborted (max_turns + grace exceeded). */
    aborted: boolean;
    /** True if the agent was steered to wrap up (hit soft turn limit) but finished in time. */
    steered: boolean;
}
export declare function runAgent(ctx: ExtensionContext, type: SubagentType, prompt: string, options: RunOptions): Promise<RunResult>;
/**
 * Send a new prompt to an existing session (resume).
 */
export declare function resumeAgent(session: AgentSession, prompt: string, options?: {
    onToolActivity?: (activity: ToolActivity) => void;
    onAssistantUsage?: (usage: {
        input: number;
        output: number;
        cacheWrite: number;
    }) => void;
    onCompaction?: (info: {
        reason: "manual" | "threshold" | "overflow";
        tokensBefore: number;
    }) => void;
    signal?: AbortSignal;
}): Promise<string>;
/**
 * Send a steering message to a running subagent.
 * The message will interrupt the agent after its current tool execution.
 */
export declare function steerAgent(session: AgentSession, message: string): Promise<void>;
/**
 * Get the subagent's conversation messages as formatted text.
 */
export declare function getAgentConversation(session: AgentSession): string;
