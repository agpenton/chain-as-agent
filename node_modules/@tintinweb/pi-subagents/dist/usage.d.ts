/** usage.ts — Token usage: shapes, accumulator operators, session-stats readers. */
/**
 * Lifetime usage components, accumulated via `message_end` events. Survives
 * compaction (which replaces session.state.messages and would reset any
 * stats-derived sum). cacheRead is excluded because each turn's cacheRead is
 * the cumulative cached prefix re-read on that one call — summing across
 * turns counts the prefix N times. See issue #38.
 */
export type LifetimeUsage = {
    input: number;
    output: number;
    cacheWrite: number;
};
/** Sum of lifetime usage components, or 0 if undefined. */
export declare function getLifetimeTotal(u?: LifetimeUsage): number;
/** Add a usage delta into a target accumulator (mutates target). */
export declare function addUsage(into: LifetimeUsage, delta: LifetimeUsage): void;
/** Minimal shape we read from upstream `getSessionStats()`. */
export type SessionStatsLike = {
    tokens: {
        input: number;
        output: number;
        cacheWrite: number;
    };
    contextUsage?: {
        percent: number | null;
    };
};
export type SessionLike = {
    getSessionStats(): SessionStatsLike;
};
/**
 * Session-scoped token count: input + output + cacheWrite as reported by
 * upstream `getSessionStats().tokens` for the *current* session window.
 *
 * RESETS at compaction — upstream replaces `session.state.messages` and the
 * stats are derived from that array. For a lifetime total that survives
 * compaction, use `getLifetimeTotal(lifetimeUsage)` instead, which reads
 * from an independent accumulator fed by `message_end` events.
 *
 * Avoids upstream's `tokens.total` field, which sums per-turn `cacheRead`
 * and so counts the cumulative cached prefix N times across N turns
 * (issue #38).
 */
export declare function getSessionTokens(session: SessionLike | undefined): number;
/**
 * Context-window utilization (0–100), or null when unavailable
 * (no model contextWindow, or post-compaction before the next response).
 */
export declare function getSessionContextPercent(session: SessionLike | undefined): number | null;
