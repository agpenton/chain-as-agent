/**
 * conversation-viewer.ts — Live conversation overlay for viewing agent sessions.
 *
 * Displays a scrollable, live-updating view of an agent's conversation.
 * Subscribes to session events for real-time streaming updates.
 */
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { type Component, type TUI } from "@earendil-works/pi-tui";
import type { AgentRecord } from "../types.js";
import type { Theme } from "./agent-widget.js";
import { type AgentActivity } from "./agent-widget.js";
import { type ViewerKeybindings } from "./viewer-keys.js";
/** Height ceiling shared by the overlay's `maxHeight` and the viewer's internal viewport cap. */
export declare const VIEWPORT_HEIGHT_PCT = 70;
export declare class ConversationViewer implements Component {
    private tui;
    private session;
    private record;
    private activity;
    private theme;
    private done;
    /** Abort the agent shown here. Omitted → no stop affordance (e.g. read-only history). */
    private onStop?;
    private scrollOffset;
    private autoScroll;
    private unsubscribe;
    private lastInnerW;
    private closed;
    /** Two-press confirm guard for the stop key, so a stray key can't kill the agent. */
    private stopArmed;
    private keys;
    constructor(tui: TUI, session: AgentSession, record: AgentRecord, activity: AgentActivity | undefined, theme: Theme, done: (result: undefined) => void, 
    /** Abort the agent shown here. Omitted → no stop affordance (e.g. read-only history). */
    onStop?: (() => void) | undefined, 
    /** User keybindings from `ctx.ui.custom()`. Omitted → hardcoded defaults. */
    keybindings?: ViewerKeybindings);
    handleInput(data: string): void;
    render(width: number): string[];
    /** Stoppable only when a stop handler exists and the agent is still active. */
    private isStoppable;
    invalidate(): void;
    dispose(): void;
    private viewportHeight;
    private chromeLines;
    private invocationLine;
    private buildContentLines;
}
