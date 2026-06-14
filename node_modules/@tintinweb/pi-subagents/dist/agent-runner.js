/**
 * agent-runner.ts — Core execution engine: creates sessions, runs agents, collects results.
 */
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, SettingsManager, } from "@earendil-works/pi-coding-agent";
import { BUILTIN_TOOL_NAMES, getAgentConfig, getConfig, getMemoryToolNames, getReadOnlyMemoryToolNames, getToolNamesForType } from "./agent-types.js";
import { buildParentContext, extractText } from "./context.js";
import { DEFAULT_AGENTS } from "./default-agents.js";
import { detectEnv } from "./env.js";
import { buildMemoryBlock, buildReadOnlyMemoryBlock } from "./memory.js";
import { buildAgentPrompt } from "./prompts.js";
import { preloadSkills } from "./skill-loader.js";
/**
 * Tool names registered by THIS extension. Single source of truth so the
 * registration sites (index.ts) and the subagent exclusion list below can't
 * drift apart. These are our own tools, not pi built-ins, so they can't be
 * derived from pi — but they only need defining once.
 */
export const SUBAGENT_TOOL_NAMES = {
    AGENT: "Agent",
    GET_RESULT: "get_subagent_result",
    STEER: "steer_subagent",
};
/** Names of tools registered by this extension that subagents must NOT inherit. */
const EXCLUDED_TOOL_NAMES = Object.values(SUBAGENT_TOOL_NAMES);
/**
 * Canonical name of an extension for `extensions: [...]` allowlist matching.
 * Lowercased — extension names match case-insensitively so `extensions: [Mcp]`
 * resolves the same as `[mcp]`. Tool names within `ext:foo/bar` are not affected.
 * Directory extensions (`foo/index.ts`) resolve to the parent directory name;
 * single-file extensions to the basename minus `.ts`/`.js`.
 */
export function extensionCanonicalName(extPath) {
    const base = basename(extPath);
    const name = base === "index.ts" || base === "index.js"
        ? basename(dirname(extPath))
        : base.replace(/\.(ts|js)$/, "");
    return name.toLowerCase();
}
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
export function parseExtensionsSpec(entries, cwd) {
    const names = new Set();
    const paths = [];
    let wildcard = false;
    for (const entry of entries) {
        if (!entry)
            continue;
        if (entry === "*") {
            wildcard = true;
            continue;
        }
        const isPathEntry = entry.includes("/") || entry.includes("\\") || entry.startsWith("~");
        if (!isPathEntry) {
            names.add(entry.toLowerCase());
            continue;
        }
        let p = entry;
        if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
            p = homedir() + p.slice(1);
        }
        const abs = isAbsolute(p) ? p : resolve(cwd, p);
        paths.push(abs);
        names.add(extensionCanonicalName(abs));
    }
    return { names, paths, wildcard };
}
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
export function parseExtSelectors(entries) {
    const extNames = new Set();
    const narrowing = new Map();
    for (const raw of entries) {
        if (!raw)
            continue;
        const body = raw.slice("ext:".length);
        const slash = body.indexOf("/");
        // Extension name matches case-insensitively (matches the loader-side canonical
        // name). Tool names are case-preserved — they're matched against pi-mono's
        // registered identifiers, which are case-sensitive.
        const name = (slash === -1 ? body : body.slice(0, slash)).trim().toLowerCase();
        if (!name)
            continue;
        extNames.add(name);
        if (slash === -1)
            continue;
        const tool = body.slice(slash + 1).trim();
        if (!tool)
            continue;
        let set = narrowing.get(name);
        if (!set) {
            set = new Set();
            narrowing.set(name, set);
        }
        set.add(tool);
    }
    return { extNames, narrowing };
}
/** Default max turns. undefined = unlimited (no turn limit). */
let defaultMaxTurns;
/** Normalize max turns. undefined or 0 = unlimited, otherwise minimum 1. */
export function normalizeMaxTurns(n) {
    if (n == null || n === 0)
        return undefined;
    return Math.max(1, n);
}
/** Get the default max turns value. undefined = unlimited. */
export function getDefaultMaxTurns() { return defaultMaxTurns; }
/** Set the default max turns value. undefined or 0 = unlimited, otherwise minimum 1. */
export function setDefaultMaxTurns(n) { defaultMaxTurns = normalizeMaxTurns(n); }
/** Additional turns allowed after the soft limit steer message. */
let graceTurns = 5;
/** Get the grace turns value. */
export function getGraceTurns() { return graceTurns; }
/** Set the grace turns value (minimum 1). */
export function setGraceTurns(n) { graceTurns = Math.max(1, n); }
/**
 * Try to find the right model for an agent type.
 * Priority: explicit option > config.model > parent model.
 */
function resolveDefaultModel(parentModel, registry, configModel) {
    if (configModel) {
        const slashIdx = configModel.indexOf("/");
        if (slashIdx !== -1) {
            const provider = configModel.slice(0, slashIdx);
            const modelId = configModel.slice(slashIdx + 1);
            // Build a set of available model keys for fast lookup
            const available = registry.getAvailable?.();
            const availableKeys = available
                ? new Set(available.map((m) => `${m.provider}/${m.id}`))
                : undefined;
            const isAvailable = (p, id) => !availableKeys || availableKeys.has(`${p}/${id}`);
            const found = registry.find(provider, modelId);
            if (found && isAvailable(provider, modelId))
                return found;
        }
    }
    return parentModel;
}
/**
 * Subscribe to a session and collect the last assistant message text.
 * Returns an object with a `getText()` getter and an `unsubscribe` function.
 */
function collectResponseText(session) {
    let text = "";
    const unsubscribe = session.subscribe((event) => {
        if (event.type === "message_start") {
            text = "";
        }
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            text += event.assistantMessageEvent.delta;
        }
    });
    return { getText: () => text, unsubscribe };
}
/** Get the last assistant text from the completed session history. */
function getLastAssistantText(session) {
    for (let i = session.messages.length - 1; i >= 0; i--) {
        const msg = session.messages[i];
        if (msg.role !== "assistant")
            continue;
        const text = extractText(msg.content).trim();
        if (text)
            return text;
    }
    return "";
}
/**
 * Wire an AbortSignal to abort a session.
 * Returns a cleanup function to remove the listener.
 */
function forwardAbortSignal(session, signal) {
    if (!signal)
        return () => { };
    const onAbort = () => session.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    return () => signal.removeEventListener("abort", onAbort);
}
export async function runAgent(ctx, type, prompt, options) {
    const config = getConfig(type);
    const agentConfig = getAgentConfig(type);
    // Resolve working directory: worktree override > parent cwd
    const effectiveCwd = options.cwd ?? ctx.cwd;
    // Filesystem work happens in effectiveCwd; config discovery in configCwd.
    // They differ only for SpawnOptions.cwd spawns (config stays with the parent).
    const configCwd = options.configCwd ?? effectiveCwd;
    const env = await detectEnv(options.pi, effectiveCwd);
    // Get parent system prompt for append-mode agents
    const parentSystemPrompt = ctx.getSystemPrompt();
    // Build prompt extras (memory, skill preloading)
    const extras = {};
    // Resolve extensions/skills: isolated overrides to false
    const extensions = options.isolated ? false : config.extensions;
    // Nulling excludes under isolated also suppresses the orphaned-exclude warning —
    // isolation is an intentional override, not a misconfiguration.
    const excludeExtensions = options.isolated ? undefined : config.excludeExtensions;
    const skills = options.isolated ? false : config.skills;
    // Skill preloading: when skills is string[], preload their content into prompt
    if (Array.isArray(skills)) {
        const loaded = preloadSkills(skills, configCwd);
        if (loaded.length > 0) {
            extras.skillBlocks = loaded;
        }
    }
    let toolNames = getToolNamesForType(type);
    // Persistent memory: detect write capability and branch accordingly.
    // Account for disallowedTools — a tool in the base set but on the denylist is not truly available.
    if (agentConfig?.memory) {
        const existingNames = new Set(toolNames);
        const denied = agentConfig.disallowedTools ? new Set(agentConfig.disallowedTools) : undefined;
        const effectivelyHas = (name) => existingNames.has(name) && !denied?.has(name);
        const hasWriteTools = effectivelyHas("write") || effectivelyHas("edit");
        if (hasWriteTools) {
            // Read-write memory: add any missing memory tool names (read/write/edit)
            const extraNames = getMemoryToolNames(existingNames);
            if (extraNames.length > 0)
                toolNames = [...toolNames, ...extraNames];
            extras.memoryBlock = buildMemoryBlock(agentConfig.name, agentConfig.memory, configCwd);
        }
        else {
            // Read-only memory: only add read tool name, use read-only prompt
            const extraNames = getReadOnlyMemoryToolNames(existingNames);
            if (extraNames.length > 0)
                toolNames = [...toolNames, ...extraNames];
            extras.memoryBlock = buildReadOnlyMemoryBlock(agentConfig.name, agentConfig.memory, configCwd);
        }
    }
    // Build system prompt from agent config
    let systemPrompt;
    if (agentConfig) {
        systemPrompt = buildAgentPrompt(agentConfig, effectiveCwd, env, parentSystemPrompt, extras);
    }
    else {
        // Unknown type fallback: spread the canonical general-purpose config (defensive —
        // unreachable in practice since index.ts resolves unknown types before calling runAgent).
        const fallback = DEFAULT_AGENTS.get("general-purpose");
        if (!fallback)
            throw new Error(`No fallback config available for unknown type "${type}"`);
        systemPrompt = buildAgentPrompt({ ...fallback, name: type }, effectiveCwd, env, parentSystemPrompt, extras);
    }
    // When skills is string[], we've already preloaded them into the prompt.
    // Still pass noSkills: true since we don't need the skill loader to load them again.
    const noSkills = skills === false || Array.isArray(skills);
    const agentDir = getAgentDir();
    // Extension loading:
    // - true  → all default-discovered extensions
    // - false → none (noExtensions)
    // - string[] → loader-level allowlist. Bare names keep the matching
    //   default-discovered extension; path entries load that extension fresh;
    //   "*" keeps all default-discovered extensions. Excluded extensions never
    //   bind handlers or register tools (their factory still runs once).
    //
    // Suppress AGENTS.md/CLAUDE.md and APPEND_SYSTEM.md — upstream's
    // buildSystemPrompt() re-appends both AFTER systemPromptOverride, which
    // would defeat prompt_mode: replace and isolated: true. Parent context, if
    // wanted, reaches the subagent via prompt_mode: append (parentSystemPrompt
    // is embedded in systemPromptOverride) or inherit_context (conversation).
    // `ext:` selectors from the `tools:` CSV narrow which extension tools surface to
    // the LLM. They do NOT control loading — `extensions:` is the sole authority for
    // which extensions load. `ext:foo` against an extension that `extensions:` excluded
    // is an orphan and warns after reload. `isolated` means no extension tools at all.
    const { extNames, narrowing } = parseExtSelectors(options.isolated ? [] : (agentConfig?.extSelectors ?? []));
    const noExtensions = extensions === false;
    const extensionsSpec = Array.isArray(extensions)
        ? parseExtensionsSpec(extensions, configCwd)
        : undefined;
    const keepNames = extensionsSpec?.names ?? new Set();
    // `exclude_extensions:` is a denylist applied AFTER the include set — exclude wins.
    // Plain canonical names only (case-insensitive). Note: excluded extensions'
    // factories still run once during reload() (see comment above) — exclusion
    // suppresses handler binding and tool registration; it is not a sandbox.
    const excludeNames = new Set((excludeExtensions ?? []).map((n) => n.toLowerCase()));
    const hasExcludes = excludeNames.size > 0;
    // The override filters loaded extensions down to `keepNames` minus `excludeNames`.
    // It's only needed when we're neither loading everything without excludes
    // (`extensions: true` or a `"*"` wildcard) nor nothing (`noExtensions`).
    const loadAll = extensions === true || extensionsSpec?.wildcard === true;
    const additionalExtensionPaths = extensionsSpec?.paths.length ? extensionsSpec.paths : undefined;
    // Pre-filter discovered set, captured by the override — the exclude-typo warning
    // must compare against this, not the surviving set (absence from survivors is
    // an exclude *succeeding*).
    let discoveredNames;
    const extensionsOverride = noExtensions || (loadAll && !hasExcludes)
        ? undefined
        : (base) => {
            discoveredNames = new Set(base.extensions.map((e) => extensionCanonicalName(e.path)));
            return {
                ...base,
                extensions: base.extensions.filter((e) => {
                    const name = extensionCanonicalName(e.path);
                    if (excludeNames.has(name))
                        return false; // exclude wins
                    return loadAll || keepNames.has(name);
                }),
            };
        };
    const loader = new DefaultResourceLoader({
        cwd: configCwd,
        agentDir,
        noExtensions,
        additionalExtensionPaths,
        extensionsOverride,
        noSkills,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPromptOverride: () => systemPrompt,
        appendSystemPromptOverride: () => [],
    });
    await loader.reload();
    // Plain entries in `tools:` are expected to be built-in names (extension tools
    // go through `ext:`), so an unknown name there is unambiguously a typo. Previously
    // this produced a silently broken agent (#75) — pi-mono accepted the bogus name
    // into the allowlist, then dropped it at registration with no signal back.
    if (agentConfig?.builtinToolNames?.length) {
        const knownBuiltins = new Set(BUILTIN_TOOL_NAMES);
        for (const name of agentConfig.builtinToolNames) {
            if (!knownBuiltins.has(name)) {
                options.onToolActivity?.({
                    type: "end",
                    toolName: `tools-error:tool "${name}" requested by agent "${type}" is not a known built-in`,
                });
            }
        }
    }
    // A subagent spawns mid-task, so a bad `extensions:`/`ext:` entry warns rather
    // than aborts. Two distinct misconfigurations to catch:
    //   - `extensions: [foo]` but no extension named foo was discovered (typo or
    //     path that failed to load — path entries fold their canonical name into
    //     `keepNames`, so this covers them too).
    //   - `tools: ext:foo` but foo isn't in the loaded set (because `extensions:`
    //     didn't include it). Since v0.9, `ext:` no longer pulls extensions in;
    //     loading is `extensions:`-authoritative.
    // An exclude_extensions: alongside extensions: false is contradictory — nothing
    // loads, so there is nothing to exclude.
    if (hasExcludes && noExtensions) {
        options.onToolActivity?.({
            type: "end",
            toolName: `extension-error:exclude_extensions has no effect for agent "${type}" — extensions: false loads nothing`,
        });
    }
    // Exclude typo check: compares against the PRE-filter discovered set (an excluded
    // name absent from the surviving set is the exclude working as intended). Also
    // flags path-like and "*" entries — excludes are plain names only.
    if (hasExcludes && discoveredNames) {
        for (const name of excludeNames) {
            if (!discoveredNames.has(name)) {
                options.onToolActivity?.({
                    type: "end",
                    toolName: `extension-error:exclude_extensions: "${name}" for agent "${type}" did not match any discovered extension`,
                });
            }
        }
    }
    if (keepNames.size > 0 || extNames.size > 0) {
        const survivingNames = new Set(loader.getExtensions().extensions.map((e) => extensionCanonicalName(e.path)));
        for (const name of keepNames) {
            if (!survivingNames.has(name)) {
                options.onToolActivity?.({
                    type: "end",
                    toolName: excludeNames.has(name)
                        ? `extension-error:extension "${name}" is in both extensions: and exclude_extensions: for agent "${type}" — exclude wins`
                        : `extension-error:extension "${name}" requested by agent "${type}" was not loaded`,
                });
            }
        }
        for (const name of extNames) {
            if (!survivingNames.has(name)) {
                options.onToolActivity?.({
                    type: "end",
                    toolName: `extension-error:ext:${name} referenced by agent "${type}" but extension "${name}" is not loaded (check extensions:/exclude_extensions:)`,
                });
            }
        }
    }
    // Resolve model: explicit option > config.model > parent model
    const model = options.model ?? resolveDefaultModel(ctx.model, ctx.modelRegistry, agentConfig?.model);
    // Resolve thinking level: explicit option > agent config > undefined (inherit)
    const thinkingLevel = options.thinkingLevel ?? agentConfig?.thinking;
    const disallowedSet = agentConfig?.disallowedTools
        ? new Set(agentConfig.disallowedTools)
        : undefined;
    // Enumerate extension-registered tool names from the loaded resource loader.
    // Extensions populate `extension.tools` during `loader.reload()` and the set
    // is stable afterwards — `bindExtensions` does not register new tools.
    //
    // Opt-in flip: when any `ext:` selector is present, extension tools become an
    // explicit allowlist — a loaded extension not named by a selector contributes
    // no tools (its handlers still ran), and `ext:foo/bar` narrows `foo` to `bar`.
    const extensionToolNames = [];
    if (!noExtensions) {
        const optInActive = extNames.size > 0;
        for (const extension of loader.getExtensions().extensions) {
            const canon = extensionCanonicalName(extension.path);
            if (optInActive && !extNames.has(canon))
                continue;
            const narrowed = narrowing.get(canon);
            for (const toolName of extension.tools.keys()) {
                if (narrowed && !narrowed.has(toolName))
                    continue;
                extensionToolNames.push(toolName);
            }
        }
    }
    // Build the master tool allowlist applied at session construction.
    // pi-mono's `allowedToolNames` gates BOTH registration and the initial active
    // set, so listing the exact final set here means the session is correctly
    // scoped from the first instant — no post-construction narrowing required.
    const builtinToolNameSet = new Set(toolNames);
    const allowedTools = [...toolNames, ...extensionToolNames].filter((t) => {
        if (EXCLUDED_TOOL_NAMES.includes(t))
            return false;
        if (disallowedSet?.has(t))
            return false;
        if (builtinToolNameSet.has(t))
            return true;
        // Reached only for extension tools. The extension set was already filtered
        // at the loader (extensionsOverride / noExtensions) and at enumeration
        // (`ext:` opt-in flip), so any extension tool in `extensionToolNames` is allowed.
        return !noExtensions;
    });
    const sessionOpts = {
        cwd: effectiveCwd,
        agentDir,
        sessionManager: SessionManager.inMemory(effectiveCwd),
        settingsManager: SettingsManager.create(configCwd, agentDir),
        modelRegistry: ctx.modelRegistry,
        model,
        tools: allowedTools,
        resourceLoader: loader,
    };
    if (thinkingLevel) {
        sessionOpts.thinkingLevel = thinkingLevel;
    }
    const { session } = await createAgentSession(sessionOpts);
    const baseSessionName = agentConfig?.name ?? type;
    session.setSessionName(options.agentId ? `${baseSessionName}#${options.agentId.slice(0, 8)}` : baseSessionName);
    // Bind extensions so that session_start fires and extensions can initialize
    // (e.g. loading credentials, setting up state). Tool gating already happened
    // at session construction via the `tools:` allowlist above — no separate
    // post-bind filter is needed. All ExtensionBindings fields are optional.
    await session.bindExtensions({
        onError: (err) => {
            options.onToolActivity?.({
                type: "end",
                toolName: `extension-error:${err.extensionPath}`,
            });
        },
    });
    options.onSessionCreated?.(session);
    // Track turns for graceful max_turns enforcement
    let turnCount = 0;
    const maxTurns = normalizeMaxTurns(options.maxTurns ?? agentConfig?.maxTurns ?? defaultMaxTurns);
    let softLimitReached = false;
    let aborted = false;
    let currentMessageText = "";
    const unsubTurns = session.subscribe((event) => {
        if (event.type === "turn_end") {
            turnCount++;
            options.onTurnEnd?.(turnCount);
            if (maxTurns != null) {
                if (!softLimitReached && turnCount >= maxTurns) {
                    softLimitReached = true;
                    session.steer("You have reached your turn limit. Wrap up immediately — provide your final answer now.");
                }
                else if (softLimitReached && turnCount >= maxTurns + graceTurns) {
                    aborted = true;
                    session.abort();
                }
            }
        }
        if (event.type === "message_start") {
            currentMessageText = "";
        }
        if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
            currentMessageText += event.assistantMessageEvent.delta;
            options.onTextDelta?.(event.assistantMessageEvent.delta, currentMessageText);
        }
        if (event.type === "tool_execution_start") {
            options.onToolActivity?.({ type: "start", toolName: event.toolName });
        }
        if (event.type === "tool_execution_end") {
            options.onToolActivity?.({ type: "end", toolName: event.toolName });
        }
        if (event.type === "message_end" && event.message.role === "assistant") {
            const u = event.message.usage;
            if (u)
                options.onAssistantUsage?.({
                    input: u.input ?? 0,
                    output: u.output ?? 0,
                    cacheWrite: u.cacheWrite ?? 0,
                });
        }
        if (event.type === "compaction_end" && !event.aborted && event.result) {
            options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
        }
    });
    const collector = collectResponseText(session);
    const cleanupAbort = forwardAbortSignal(session, options.signal);
    // Build the effective prompt: optionally prepend parent context
    let effectivePrompt = prompt;
    if (options.inheritContext) {
        const parentContext = buildParentContext(ctx);
        if (parentContext) {
            effectivePrompt = parentContext + prompt;
        }
    }
    try {
        await session.prompt(effectivePrompt);
    }
    finally {
        unsubTurns();
        collector.unsubscribe();
        cleanupAbort();
    }
    const responseText = collector.getText().trim() || getLastAssistantText(session);
    return { responseText, session, aborted, steered: softLimitReached };
}
/**
 * Send a new prompt to an existing session (resume).
 */
export async function resumeAgent(session, prompt, options = {}) {
    const collector = collectResponseText(session);
    const cleanupAbort = forwardAbortSignal(session, options.signal);
    const unsubEvents = (options.onToolActivity || options.onAssistantUsage || options.onCompaction)
        ? session.subscribe((event) => {
            if (event.type === "tool_execution_start")
                options.onToolActivity?.({ type: "start", toolName: event.toolName });
            if (event.type === "tool_execution_end")
                options.onToolActivity?.({ type: "end", toolName: event.toolName });
            if (event.type === "message_end" && event.message.role === "assistant") {
                const u = event.message.usage;
                if (u)
                    options.onAssistantUsage?.({
                        input: u.input ?? 0,
                        output: u.output ?? 0,
                        cacheWrite: u.cacheWrite ?? 0,
                    });
            }
            if (event.type === "compaction_end" && !event.aborted && event.result) {
                options.onCompaction?.({ reason: event.reason, tokensBefore: event.result.tokensBefore });
            }
        })
        : () => { };
    try {
        await session.prompt(prompt);
    }
    finally {
        collector.unsubscribe();
        unsubEvents();
        cleanupAbort();
    }
    return collector.getText().trim() || getLastAssistantText(session);
}
/**
 * Send a steering message to a running subagent.
 * The message will interrupt the agent after its current tool execution.
 */
export async function steerAgent(session, message) {
    await session.steer(message);
}
/**
 * Get the subagent's conversation messages as formatted text.
 */
export function getAgentConversation(session) {
    const parts = [];
    for (const msg of session.messages) {
        if (msg.role === "user") {
            const text = typeof msg.content === "string"
                ? msg.content
                : extractText(msg.content);
            if (text.trim())
                parts.push(`[User]: ${text.trim()}`);
        }
        else if (msg.role === "assistant") {
            const textParts = [];
            const toolCalls = [];
            for (const c of msg.content) {
                if (c.type === "text" && c.text)
                    textParts.push(c.text);
                else if (c.type === "toolCall")
                    toolCalls.push(`  Tool: ${c.name ?? c.toolName ?? "unknown"}`);
            }
            if (textParts.length > 0)
                parts.push(`[Assistant]: ${textParts.join("\n")}`);
            if (toolCalls.length > 0)
                parts.push(`[Tool Calls]:\n${toolCalls.join("\n")}`);
        }
        else if (msg.role === "toolResult") {
            const text = extractText(msg.content);
            const truncated = text.length > 200 ? text.slice(0, 200) + "..." : text;
            parts.push(`[Tool Result (${msg.toolName})]: ${truncated}`);
        }
    }
    return parts.join("\n\n");
}
