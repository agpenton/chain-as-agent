/**
 * agent-manager.ts — Tracks agents, background execution, resume support.
 *
 * Background agents are subject to a configurable concurrency limit (default: 4).
 * Excess agents are queued and auto-started as running agents complete.
 * Foreground agents bypass the queue (they block the parent anyway).
 */
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSession, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type ToolActivity } from "./agent-runner.js";
import type { AgentInvocation, AgentRecord, IsolationMode, SubagentType, ThinkingLevel } from "./types.js";
export type OnAgentComplete = (record: AgentRecord) => void;
export type OnAgentStart = (record: AgentRecord) => void;
export type OnAgentCompact = (record: AgentRecord, info: CompactionInfo) => void;
export type CompactionInfo = {
    reason: "manual" | "threshold" | "overflow";
    tokensBefore: number;
};
interface SpawnOptions {
    description: string;
    model?: Model<any>;
    maxTurns?: number;
    isolated?: boolean;
    inheritContext?: boolean;
    thinkingLevel?: ThinkingLevel;
    isBackground?: boolean;
    /**
     * Skip the maxConcurrent queue check for this spawn — start immediately even
     * if the configured concurrency limit would otherwise queue it. Used by the
     * scheduler so a fired job can't be deferred past its trigger window.
     */
    bypassQueue?: boolean;
    /** Isolation mode — "worktree" creates a temp git worktree for the agent. */
    isolation?: IsolationMode;
    /**
     * Working directory for the agent (absolute path). Default: parent session
     * cwd. The agent's tools operate here, but .pi config (extensions, skills,
     * settings, memory) still loads from the parent session's project — the
     * target directory's `.pi` extensions never execute. With isolation:
     * "worktree", the worktree is created FROM this directory and the result
     * branch lands in that repo.
     */
    cwd?: string;
    /** Resolved invocation snapshot captured for UI display. */
    invocation?: AgentInvocation;
    /** Parent abort signal — when aborted, the subagent is also stopped. */
    signal?: AbortSignal;
    /** Called on tool start/end with activity info (for streaming progress to UI). */
    onToolActivity?: (activity: ToolActivity) => void;
    /** Called on streaming text deltas from the assistant response. */
    onTextDelta?: (delta: string, fullText: string) => void;
    /** Called when the agent session is created (for accessing session stats). */
    onSessionCreated?: (session: AgentSession) => void;
    /** Called at the end of each agentic turn with the cumulative count. */
    onTurnEnd?: (turnCount: number) => void;
    /** Called once per assistant message_end with that message's usage delta. */
    onAssistantUsage?: (usage: {
        input: number;
        output: number;
        cacheWrite: number;
    }) => void;
    /** Called when the session successfully compacts. */
    onCompaction?: (info: CompactionInfo) => void;
}
export declare class AgentManager {
    private agents;
    private cleanupInterval;
    private onComplete?;
    private onStart?;
    private onCompact?;
    private maxConcurrent;
    /** Base repos worktrees were created from — so dispose() can prune them all,
     *  not just the parent repo (caller-supplied cwd can target other repos). */
    private worktreeRepos;
    /** Queue of background agents waiting to start. */
    private queue;
    /** Number of currently running background agents. */
    private runningBackground;
    constructor(onComplete?: OnAgentComplete, maxConcurrent?: number, onStart?: OnAgentStart, onCompact?: OnAgentCompact);
    /** Update the max concurrent background agents limit. */
    setMaxConcurrent(n: number): void;
    getMaxConcurrent(): number;
    /**
     * Spawn an agent and return its ID immediately (for background use).
     * If the concurrency limit is reached, the agent is queued.
     */
    spawn(pi: ExtensionAPI, ctx: ExtensionContext, type: SubagentType, prompt: string, options: SpawnOptions): string;
    /** Actually start an agent (called immediately or from queue drain). */
    private startAgent;
    /** Start queued agents up to the concurrency limit. */
    private drainQueue;
    /**
     * Spawn an agent and wait for completion (foreground use).
     * Foreground agents bypass the concurrency queue.
     */
    spawnAndWait(pi: ExtensionAPI, ctx: ExtensionContext, type: SubagentType, prompt: string, options: Omit<SpawnOptions, "isBackground">): Promise<AgentRecord>;
    /**
     * Resume an existing agent session with a new prompt.
     */
    resume(id: string, prompt: string, signal?: AbortSignal): Promise<AgentRecord | undefined>;
    getRecord(id: string): AgentRecord | undefined;
    listAgents(): AgentRecord[];
    abort(id: string): boolean;
    /** Dispose a record's session and remove it from the map. */
    private removeRecord;
    private cleanup;
    /**
     * Remove all completed/stopped/errored records immediately.
     * Called on session start/switch so tasks from a prior session don't persist.
     */
    clearCompleted(): void;
    /** Whether any agents are still running or queued. */
    hasRunning(): boolean;
    /** Abort all running and queued agents immediately. */
    abortAll(): number;
    /** Wait for all running and queued agents to complete (including queued ones). */
    waitForAll(): Promise<void>;
    dispose(): void;
}
export {};
