/**
 * Chain Loader - Parse YAML chain definitions from .pi/chains/*.yaml or .pi/agents/*.md files
 * 
 * This module provides chain discovery, parsing, and validation capabilities.
 * All chain definitions are validated at load time to catch errors early.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ChainAgentDependencyGraph } from './dependency-graph.js';
import { CheckpointManager } from '../chain-executor/checkpoint-manager.js';
import type { CheckpointConfig } from '../chain-executor/checkpoint-manager.js';

// ---- Types ----

/**
 * Chain definition representing a chain of agents to execute sequentially.
 * Chains are discovered from .pi/chains/*.yaml or .pi/agents/*.md files.
 */
export interface ChainDefinition {
  name: string;                              // unique chain ID
  displayName: string;                       // user-facing name
  description: string;                       // chain purpose
  version: string;                           // schema version
  agents: ChainAgent[];                      // ordered execution list
  config?: ChainConfig;                      // execution overrides
  metadata?: Record<string, unknown>;        // optional metadata
}

/**
 * Single agent in a chain with execution configuration.
 */
export interface ChainAgent {
  agent_type: string;                        // references a real agent
  prompt: string;                            // task for this agent
  context_mode?: ContextMode;                 // context propagation mode
  stop_on_error?: boolean;                   // halt chain on error
  timeout_ms?: number;                       // per-agent timeout in milliseconds
  variables?: Record<string, unknown>;     // variable injections
  retry_count?: number;                     // retry attempts (default: 3)
  backoff_base_ms?: number;                 // base exponential backoff ms
}

/**
 * Chain-wide configuration options.
 */
export interface ChainConfig {
  max_total_turns?: number;                   // chain-wide turn limit
  streaming?: boolean;                        // enable progressive output
  aggregate_mode?: 'sequential' | 'parallel' | 'smart';
  on_failure?: 'continue' | 'stop' | 'fallback';
  fallback_chain?: string;                   // alternative chain on failure
  variables?: Record<string, unknown>;        // base variable scope
  inherits?: string[];                        // base chains to inherit
  max_retries?: number;                       // default retry count per agent
  backoff_base_ms?: number;                   // default backoff base
  max_backoff_ms?: number;                    // maximum backoff cap
}

/**
 * Context propagation mode - controls what context is passed to agents.
 */
export type ContextMode = 
  | 'inherit'              // Full conversation history + prior results
  | 'inherit_compact'     // Summary of conversation + key turns
  | 'inherit_prompt_only' // Only first user prompt
  | 'none';                // Fresh context, explicit prompt only

/**
 * ValidationResult from chain validation.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Chain loader result - may contain errors or be successful.
 */
export interface ChainLoadResult {
  chain?: ChainDefinition;
  error?: string;
  warnings: string[];
  validation?: ValidationResult;
}

// ---- Constants ----

/** Default context mode for chains. */
const DEFAULT_CONTEXT_MODE: ContextMode = 'inherit_compact';

/** Default timeout per agent in milliseconds. */
const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

/** Maximum chain depth to prevent cycles. */
const MAX_AGENT_COUNT = 50;

// ---- Loader State ----

interface LoadedChainInfo {
  chain: ChainDefinition;
  sourcePath: string;
  lastModified: number;
}

// ---- Chain Loader Class ----

/**
 * ChainLoader - Discover, parse, and validate chain definitions.
 * 
 * This loader handles:
 * - YAML frontmatter parsing
 * - Chain discovery from .pi/chains/*.yaml or .pi/agents/*.md
 * - Agent type validation
 * - Circular dependency detection
 * - Variable resolution
 * 
 * All validation happens at load time to catch errors early.
 */
export class ChainLoader {
  private chains: Map<string, LoadedChainInfo> = new Map();
  private chainGraph: ChainAgentDependencyGraph;
  private chainFiles: Set<string> = new Set();
  private fileWatchers: Set<NodeJS.Timer> = new Set();
  private onChainLoad?: (chainId: string) => void;
  private onChainError?: (chainId: string, error: Error) => void;
  private onVariableResolve?: (varName: string, varValue: string) => string;
  private variableResolvers: Map<string, (ctx: VariableContext) => string> = new Map();
  
  constructor(
    private readonly chainsDir: string = '.pi/chains',
    private readonly allowChainFilesInAgents: boolean = true
  ) {
    this.chainGraph = new ChainAgentDependencyGraph();
    this.initDefaultResolvers();
  }
  
  /**
   * Load all chains from the chains directory.
   */
  async loadAll(): Promise<ChainDefinition[]> {
    const chains: ChainDefinition[] = [];
    
    try {
      // Load from .pi/chains/*.yaml
      const yamlFiles = this.listFiles(this.chainsDir, ['.yaml', '.yml']);
      for (const file of yamlFiles) {
        const result = this.loadChainFromFile(file);
        if (result.chain) {
          chains.push(result.chain);
          this.chains.set(result.chain.name, { chain: result.chain, sourcePath: file, lastModified: Date.now() });
          
          if (this.onChainLoad) {
            this.onChainLoad(result.chain.name);
          }
        }
      }
      
      // Load from .pi/agents/*.md (if enabled)
      if (this.allowChainFilesInAgents) {
        const agentsDir = join(process.cwd(), '.pi/agents');
        if (existsSync(agentsDir)) {
          const mdFiles = this.listFiles(agentsDir, ['.md']);
          for (const file of mdFiles) {
            const result = this.loadChainFromFile(file);
            if (result.chain) {
              chains.push(result.chain);
              this.chains.set(result.chain.name, { chain: result.chain, sourcePath: file, lastModified: Date.now() });
              
              if (this.onChainLoad) {
                this.onChainLoad(result.chain.name);
              }
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('[ChainLoader] Failed to load chains:', errorMsg);
      throw err;
    }
    
    return chains;
  }
  
  /**
   * Load a single chain by ID.
   */
  load(chainId: string): ChainDefinition | undefined {
    const loaded = this.chains.get(chainId);
    return loaded?.chain;
  }
  
  /**
   * List all available chains.
   */
  listChains(): ChainDefinition[] {
    return Array.from(this.chains.values()).map(info => info.chain);
  }
  
  /**
   * Get chain names for tool descriptions.
   */
  getChainNames(): string[] {
    return this.listChains().map(c => c.name);
  }
  
  /**
   * Validate a chain by ID.
   */
  validate(chainId: string): ValidationResult {
    const chain = this.load(chainId);
    if (!chain) {
      return {
        valid: false,
        errors: [`Chain "${chainId}" not found`],
        warnings: []
      };
    }
    
    return this.validateChain(chain);
  }
  
  /**
   * Reload chains (useful for watching file changes).
   */
  async reload(): Promise<void> {
    const chainNames = this.listChains().map(c => c.name);
    
    // Clear existing chains
    for (const chainName of chainNames) {
      this.chains.delete(chainName);
      if (this.onChainLoad) {
        this.onChainLoad(chainName);
      }
    }
    
    // Reload all chains
    await this.loadAll();
  }
  
  /**
   * Set hook called when chain loads.
   */
  setOnChainLoad(callback: (chainId: string) => void): void {
    this.onChainLoad = callback;
  }
  
  /**
   * Set hook called when chain loads with error.
   */
  setOnChainError(callback: (chainId: string, error: Error) => void): void {
    this.onChainError = callback;
  }
  
  /**
   * Register a variable resolver.
   */
  registerVariableResolver(
    pattern: RegExp,
    resolver: (match: RegExpMatchArray, context: VariableContext) => string
  ): void {
    this.variableResolvers.set(pattern.source, resolver);
  }
  
  /**
   * Resolve variables in a template.
   */
  resolveVariables(template: string, context: VariableContext): string {
    let resolved = template;
    
    // Resolve environment variables ($VAR_NAME)
    resolved = resolved.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
      const varValue = context.env?.[varName] ?? '';
      return resolved = resolved.replace(match, varValue || match);
    });
    
    // Resolve chain config variables ({{config:key}})
    resolved = resolved.replace(/\{\{config:([^\}]+)\}\}/g, (match, keyPath) => {
      const value = this.resolvePath(context.chainConfig?.variables, keyPath);
      return resolved = resolved.replace(match, value || match);
    });
    
    // Resolve previous agent results ({{agent_result:N}})
    resolved = resolved.replace(/\{\{agent_result:(\d+)\}\}/g, (match, idx) => {
      const agentIdx = parseInt(idx, 10);
      const value = context.previousResults[agentIdx]?.result ?? '';
      return resolved = resolved.replace(match, value || match);
    });
    
    // Resolve file content ({{file:path}})
    resolved = resolved.replace(/\{\{file:([^\}]+)\}\}/g, (match, filePath) => {
      try {
        const content = context.fileLoader?.(filePath) ?? '';
        return resolved = resolved.replace(match, content || match);
      } catch (err) {
        return resolved = resolved.replace(match, match);
      }
    });
    
    // Custom resolvers
    for (const [pattern, resolver] of this.variableResolvers) {
      const regex = new RegExp(pattern, 'g');
      let match: RegExpMatchArray | null | undefined;
      while ((match = regex.exec(template)) !== null) {
        const resolvedValue = resolver(match);
        resolved = resolved.replace(match[0], resolvedValue);
      }
    }
    
    return resolved;
  }
  
  /**
   * Helper: Load a single chain from a file.
   */
  private loadChainFromFile(filePath: string): ChainLoadResult {
    const warnings: string[] = [];
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const name = basename(filePath, extname(filePath));
      
      let chainObj: Record<string, unknown>;
      const isYaml = ['/yaml', '/yml'].includes(extname(filePath));
      
      if (isYaml) {
        chainObj = parseYaml(content);
      } else {
        // Markdown with frontmatter
        const parts = content.split('\n---\n');
        if (parts.length >= 3) {
          chainObj = parseYaml(parts[1]);
        }
      }
      
      if (typeof chainObj !== 'object' || chainObj === null) {
        return {
          chain: undefined,
          error: `Invalid chain file format: ${filePath}`,
          warnings
        };
      }
      
      // Build chain definition
      const chain = this.buildChainDefinition(name, chainObj, warnings);
      if (!chain) {
        return {
          chain: undefined,
          error: `Failed to build chain definition for: ${name}`,
          warnings
        };
      }
      
      // Validate chain
      const validation = this.validateChain(chain);
      if (!validation.valid) {
        return {
          chain: undefined,
          error: `Chain validation failed: ${validation.errors.join(', ')}`,
          warnings: [...warnings, ...validation.warnings],
          validation
        };
      }
      
      // Register chain
      return {
        chain,
        warnings,
        validation: { valid: true, errors: [], warnings: [] }
      };
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to load ${filePath}: ${errorMsg}`);
      
      if (this.onChainError) {
        this.onChainError(err instanceof Error ? err : new Error(errorMsg));
      }
      
      return {
        chain: undefined,
        error: `Failed to load chain: ${errorMsg}`,
        warnings
      };
    }
  }
  
  /**
   * Helper: Build a ChainDefinition from parsed YAML.
   */
  private buildChainDefinition(
    name: string,
    obj: Record<string, unknown>,
    warnings: string[]
  ): ChainDefinition | undefined {
    // Required fields
    const displayName = (obj.displayName as string) ?? name;
    const description = (obj.description as string) ?? '';
    const version = (obj.version as string) ?? '1.0';
    const agents = (obj.agents as ChainAgent[]) ?? [];
    
    // Validate required fields
    if (!displayName || typeof displayName !== 'string') {
      warnings.push('Chain missing displayName, using name');
    }
    
    // Default fields
    const config = obj.config as ChainConfig | undefined;
    const metadata = obj.metadata as Record<string, unknown> | undefined;
    
    // Validate chain agent count
    if (agents.length > MAX_AGENT_COUNT) {
      warnings.push(`Chain "${name}" has ${agents.length} agents, exceeding limit of ${MAX_AGENT_COUNT}`);
    }
    
    // Build ChainDefinition
    return {
      name,
      displayName,
      description,
      version,
      agents,
      config: this.normalizeChainConfig(config),
      metadata
    };
  }
  
  /**
   * Helper: Normalize chain config with defaults.
   */
  private normalizeChainConfig(config?: ChainConfig): ChainConfig | undefined {
    if (!config) return undefined;
    
    return {
      max_total_turns: config.max_total_turns,
      streaming: config.streaming ?? false,
      aggregate_mode: config.aggregate_mode ?? 'sequential',
      on_failure: config.on_failure ?? 'continue',
      fallback_chain: config.fallback_chain,
      variables: config.variables,
      inherits: config.inherits,
      max_retries: config.max_retries ?? config.max_retries ?? 3,
      backoff_base_ms: config.backoff_base_ms ?? 1000,
      max_backoff_ms: config.max_backoff_ms ?? 30000
    };
  }
  
  /**
   * Helper: Validate a chain definition.
   */
  private validateChain(chain: ChainDefinition): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Validate agent count
    if (chain.agents.length > MAX_AGENT_COUNT) {
      errors.push(`Chain "${chain.name}" exceeds maximum agent limit of ${MAX_AGENT_COUNT}`);
      return { valid: false, errors, warnings };
    }
    
    // Validate agent types exist
    for (const agent of chain.agents) {
      if (!agent.agent_type || typeof agent.agent_type !== 'string') {
        errors.push(`Chain "${chain.name}" agent missing agent_type`);
        return { valid: false, errors, warnings };
      }
      
      if (!agent.prompt || typeof agent.prompt !== 'string') {
        warnings.push(`Chain "${chain.name}" agent "${agent.agent_type}" missing prompt`);
      }
      
      // Validate agent config
      if (agent.timeout_ms !== undefined) {
        if (agent.timeout_ms <= 0 || !Number.isFinite(agent.timeout_ms)) {
          warnings.push(`Chain "${chain.name}" agent "${agent.agent_type}" has invalid timeout`);
        }
      }
      
      if (agent.variables !== undefined && typeof agent.variables !== 'object') {
        warnings.push(`Chain "${chain.name}" agent "${agent.agent_type}" has invalid variables`);
      }
    }
    
    // Validate fallback chain if configured
    if (chain.config?.on_failure === 'fallback' && chain.config?.fallback_chain) {
      // Fallback validation happens at chain loader level
      errors.push(`Fallback chain "${chain.config.fallback_chain}" not found`);
    }
    
    // Detect cycles in agent dependencies
    const chainGraph = this.buildChainGraph(chain);
    const cycles = this.chainGraph.detectCycles(chainGraph) as CycleInfo[];
    if (cycles.length > 0) {
      for (const cycle of cycles) {
        errors.push(`Circular dependency in chain "${chain.name}": ${(cycle.nodes || cycle).join(' → ')}`);
      }
    }
    
    // Validate variables
    for (const agent of chain.agents) {
      if (agent.variables) {
        for (const [varName, varValue] of Object.entries(agent.variables)) {
          if (typeof varValue === 'string') {
            // Check for circular variable references
            const varTemplate = varValue as string;
            if (varTemplate.match(/{{\w+:?[^}]+}}/g)?.some(
              pattern => pattern.includes(`{{${varName}`)
            )) {
              warnings.push(`Circular variable reference in chain "${chain.name}", agent "${agent.agent_type}"`);
            }
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Build dependency graph for cycles.
   */
  private buildChainGraph(chain: ChainDefinition): ChainAgentDependencyGraph {
    const graph = new ChainAgentDependencyGraph();
    
    for (const agent of chain.agents) {
      if (!agent.variables) continue;
      
      for (const [varName, varValue] of Object.entries(agent.variables)) {
        if (typeof varValue !== 'string') continue;
        
        // Extract dependencies
        const matches = varValue.match(/{{\w+:?([^}]+)}}/g) ?? [];
        for (const match of matches) {
          const dep = match.replace(/{{([^}]+)}}/g, '$1');
          if (dep.startsWith('agent_result:')) {
            const agentIdx = parseInt(dep.split(':')[1], 10);
            if (!Number.isNaN(agentIdx)) {
              graph.nodes.add(agent.agent_type);
            graph.addEdge(agent.agent_type, chain.agents[agentIdx]?.agent_type);
            }
          }
        }
      }
    }
    
    return graph;
  }
  
  /**
   * Helper: List files in directory.
   */
  private listFiles(dir: string, extensions: string[]): string[] {
    if (!existsSync(dir)) return [];
    
    try {
      const files = readdirSync(dir);
      return files.filter(f => extensions.some(ext => f.endsWith(ext)));
    } catch (err) {
      console.error(`[ChainLoader] Failed to list ${dir}: ${err}`);
      return [];
    }
  }
  
  /**
   * Initialize default variable resolvers.
   */
  private initDefaultResolvers(): void {
    // Built-in resolvers handled in resolveVariables()
  }
  
  /**
   * Resolve a config path like "variables.chain.repo".
   */
  private resolvePath(obj: Record<string, unknown> | undefined, path: string): string | undefined {
    if (!obj) return undefined;
    
    const parts = path.split('.');
    let result: unknown = obj;
    
    for (const part of parts) {
      if (result === undefined || result === null) return undefined;
      result = (result as Record<string, unknown>)[part];
    }
    
    return result?.toString() ?? undefined;
  }
}

/**
 * Variable context for variable resolution.
 */
export interface VariableContext {
  env?: Record<string, string>;
  chainConfig?: ChainConfig;
  previousResults?: Array<{
    agentType: string;
    result: string;
    tokens: number;
  }>;
  fileLoader?: (path: string) => string;
}

// Backwards compatible export
export type ChainAgentContextMode = ContextMode;
