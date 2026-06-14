/**
 * prompts.ts — System prompt builder for agents.
 */
import type { AgentConfig, EnvInfo } from "./types.js";
/** Extra sections to inject into the system prompt (memory, skills, etc.). */
export interface PromptExtras {
    /** Persistent memory content to inject (first 200 lines of MEMORY.md + instructions). */
    memoryBlock?: string;
    /** Preloaded skill contents to inject. */
    skillBlocks?: {
        name: string;
        content: string;
    }[];
}
/**
 * Build the system prompt for an agent from its config.
 *
 * - "replace" mode: env header + config.systemPrompt (full control, no parent identity)
 * - "append" mode: parent system prompt + sub-agent context + env header + config.systemPrompt
 * - "append" with empty systemPrompt: pure parent clone
 *
 * Both modes include an `<active_agent name="${config.name}"/>` tag so downstream
 * extensions (e.g. permission/policy systems) can resolve per-agent policy
 * inside the child session by parsing the system prompt. In replace mode the tag
 * is prepended; in append mode it follows the shared inherited content so the
 * parent prompt forms an identical, cacheable byte prefix with the parent
 * session (the LLM's KV cache can then reuse those tokens across every spawn).
 *
 * @param parentSystemPrompt  The parent agent's effective system prompt (for append mode).
 * @param extras  Optional extra sections to inject (memory, preloaded skills).
 */
export declare function buildAgentPrompt(config: AgentConfig, cwd: string, env: EnvInfo, parentSystemPrompt?: string, extras?: PromptExtras): string;
