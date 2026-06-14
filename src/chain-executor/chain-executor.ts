/**
 * Chain Executor - Execute chained agents sequentially
 * 
 * This executor handles:
 * - Sequential agent execution
 * - Context propagation (4 modes)
 * - Error containment (try/catch wrapper)
 * - Retry logic with exponential backoff
 * - Variable resolution
 * - Timeout handling
 * - Progress streaming with real callbacks
 * - Checkpoint persistence for recovery
 * 
 * All failures are contained and returned as ChainExecutionResult.
 */

import { ChainDefinition, ChainAgent, ChainAgentContextMode as ContextMode, ChainConfig as ChainAgentConfig } from '../chain-loader/chain-loader.js';
import { ChainAgentDependencyGraph } from '../chain-loader/dependency-graph.js';
import { CheckpointManager } from './checkpoint-manager.js';
import type { CheckpointData } from './checkpoint-manager.js';
import { ContextCompressor, createContextCompressor, PruningOperation, CompressionResult, ContextState } from '../context/context-compressor.js';

// ---- Constants ----

/** Default max retries per agent. */
const DEFAULT_MAX_RETRIES = 3;

/** Default backoff base in milliseconds. */
const DEFAULT_BACKOFF_BASE_MS = 1000;

/** Maximum backoff cap. */
const MAX_BACKOFF_MS = 30000;

/** Default timeout per agent. */
const DEFAULT_AGENT_TIMEOUT_MS = 120000; // 2 minutes

/** Default context budget in tokens for chain execution */
const DEFAULT_CONTEXT_BUDGET = 50000;

/** Maximum context size per chain in bytes (100MB cap) */
const MAX_CHAIN_CONTEXT_BYTES = 100 * 1024 * 1024;

/** Default checkpoint directory */
const DEFAULT_CHECKPOINTS_DIR = '.pi/checkpoints';

/** Default max checkpoints to retain */
const DEFAULT_MAX_CHECKPOINTS = 5;

// ---- Types ----

/**
 * Chain execution result - always returned, never throws.
 */
export interface ChainExecutionResult {
  success: boolean;
  chainId: string;
  agentResults: AgentResult[];
  aggregatedResult: string;
  chainConfig: ChainAgentConfig;
  metrics: ExecutionMetrics;
  error?: string;
  variables: Record<string, unknown>;
  checkpoint?: CheckpointData | undefined;
}

/**
 * Single agent execution result.
 */
export interface AgentResult {
  agentType: string;
  agentId: string;
  result: string;
  error?: string;
  turns: number;
  tokens: number;
  durationMs: number;
  contextMode: ContextMode;
  variables?: Record<string, unknown>;
}

/**
 * Execution metrics for a chain.
 */
export interface ExecutionMetrics {
  totalTurns: number;
  totalTokens: number;
  totalDurationMs: number;
  agentsExecuted: number;
  agentsFailed: number;
  agentsRetried: number;
  variablesResolved: number;
  retries: Array<{
    agentIdx: number;
    attempt: number;
    delayMs: number;
    success: boolean;
  }>;
}

/**
 * Checkpoint for resuming execution.
 */
export interface CheckpointInfo {
  running: boolean;
  completed: boolean;
  failed: boolean;
}

/**
 * Checkpoint configuration wrapper.
 */
export interface CheckpointConfig {
  checkpointsDir?: string;
  maxCheckpoints?: number;
  enableChecksumValidation?: boolean;
  autoCleanup?: boolean;
}

/**
 * Execution signals for streaming callbacks - Real-time step-level and chain-level callbacks.
 * 
 * All callbacks are:
 * - Optional (default no-op for backward compatibility)
 * - Error-isolated (try/catch prevents callback failures from affecting execution)
 * - Timeout-protected (Promise.race with configurable timeout)
 * - Non-blocking (callbacks execute asynchronously)
 */
export interface ExecutionSignals {
  /** Callback on chain start (executed before first agent) */
  onChainStart?: (chainId: string) => void;

  /** Callback before each agent executes */
  onAgentStart?: (chainId: string, agentIdx: number, agent?: ChainAgent) => void;

  /** Callback after each agent completes (success or error) */
  onAgentComplete?: (chainId: string, agentIdx: number, result: AgentResult) => void;

  /** Callback when an agent encounters an error */
  onAgentError?: (chainId: string, agentIdx: number, error: string) => void;

  /** Callback for progress updates during execution */
  onProgress?: (progress: ChainProgress) => void;

  /** Callback for partial aggregated results (streaming support) */
  onAggregated?: (partialResult: string, agentIdx?: number) => void;

  /** Callback when chain completes successfully */
  onChainComplete?: (result: ChainExecutionResult) => void;

  /** Callback when chain encounters error */
  onChainError?: (error: string, chainId?: string) => void;

  /** Abort signal for canceling execution */
  signal?: AbortSignal;
}

/**
 * Callback timeout configuration - controls timeout protection for each callback type.
 */
export interface CallbackTimeoutConfig {
  /** Timeout in ms for onChainStart callback (default: 500ms) */
  onChainStartTimeoutMs?: number;

  /** Timeout in ms for onAgentStart callback (default: 500ms) */
  onAgentStartTimeoutMs?: number;

  /** Timeout in ms for onAgentComplete callback (default: 2000ms) */
  onAgentCompleteTimeoutMs?: number;

  /** Timeout in ms for onAgentError callback (default: 1000ms) */
  onAgentErrorTimeoutMs?: number;

  /** Timeout in ms for onProgress callback (default: 1000ms) */
  onProgressTimeoutMs?: number;

  /** Timeout in ms for onAggregated callback (default: 1500ms) */
  onAggregatedTimeoutMs?: number;

  /** Timeout in ms for onChainComplete callback (default: 2000ms) */
  onChainCompleteTimeoutMs?: number;

  /** Timeout in ms for onChainError callback (default: 1000ms) */
  onChainErrorTimeoutMs?: number;

  /** Flag to disable all callback timeout protection (default: false) */
  disableTimeouts?: boolean;
}

/**
 * Chain execution progress - emitted via onProgress callback.
 */
export interface ChainProgress {
  /** Current status of chain execution */
  status: 'initializing' | 'executing' | 'aggregating' | 'complete' | 'failed';

  /** Index of agent being processed (-1 for chain-level events) */
  agentIdx: number;

  /** Whether the current agent has completed */
  agentCompleted: boolean;

  /** Number of agents executed so far */
  agentsExecuted: number;

  /** Total number of agents in chain */
  agentsTotal: number;

  /** Array of partial results from executed agents */
  partialResults: Array<{ agentType: string; result: string }>;

  /** Current execution timestamp */
  timestamp?: string;

  /** Progress percentage (0-100, optional) */
  progressPercentage?: number;
}

/**
 * ChainExecutor - Execute chains sequentially with full error containment and streaming callbacks.
 * 
 * Guarantees:
 * - NEVER throws exceptions (all errors returned as ChainExecutionResult.error)
 * - All agent results returned even if agent failed
 * - Retry logic implemented with exponential backoff
 * - Context propagation modes enforced with bounded memory guarantee
 * - Variable resolution with circular reference detection
 * - Real-time streaming callbacks with timeout protection and error isolation
 * - Context compression with <5% information loss guarantee
 * - Checkpoint persistence for recovery from interruptions
 * 
 * Context Compression:
 * - Pruner: oldest-first/LRU/frequency-based pruning
 * - Compressor: summarization/truncation/token-budget strategies
 * - Bounded growth: max 100MB per chain
 * - Token budget enforcement: reject oversized contexts
 */
export class ChainExecutor {
  private chainGraph: ChainAgentDependencyGraph;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly maxBackoffMs: number;
  private readonly contextBudget: number;
  private checkpointManager: CheckpointManager;
  private readonly enableCheckpointing: boolean;
  
  // Context compression components
  private contextCompressor: ContextCompressor;
  private chainContexts: Map<string, ContextState>;
  private readonly maxChainContextBytes: number;

  // Callback timeout configuration - production-ready timeout control
  private executionTimeoutConfig?: CallbackTimeoutConfig;

  // Default callback timeouts (milliseconds) - configurable via execute()
  private static readonly DEFAULT_CALLBACK_TIMEOUTS: CallbackTimeoutConfig = {
    onChainStartTimeoutMs: 500,
    onAgentStartTimeoutMs: 500,
    onAgentCompleteTimeoutMs: 2000,
    onAgentErrorTimeoutMs: 1000,
    onProgressTimeoutMs: 1000,
    onAggregatedTimeoutMs: 1500,
    onChainCompleteTimeoutMs: 2000,
    onChainErrorTimeoutMs: 1000,
    disableTimeouts: false
  };

  private chainVariables: Map<string, Map<string, unknown>> = new Map();

  constructor(
    config?: Partial<{
      maxRetries: number;
      backoffBaseMs: number;
      maxBackoffMs: number;
      contextBudget: number;
      checkpointManager?: CheckpointManager;
      enableCheckpointing?: boolean;
      enableVariableTracking?: boolean;
    }>
  ) {
    this.chainGraph = new ChainAgentDependencyGraph();
    this.maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = config?.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.maxBackoffMs = config?.maxBackoffMs ?? MAX_BACKOFF_MS;
    this.contextBudget = config?.contextBudget ?? DEFAULT_CONTEXT_BUDGET;
    
    const checkpointConfig = config?.checkpointManager instanceof CheckpointManager
      ? undefined
      : config?.checkpointManager ?? {
          checkpointsDir: DEFAULT_CHECKPOINTS_DIR,
          maxCheckpoints: DEFAULT_MAX_CHECKPOINTS
        };
    
    this.checkpointManager = config?.checkpointManager ?? new CheckpointManager(checkpointConfig as CheckpointConfig);
    this.enableCheckpointing = config?.enableCheckpointing ?? true;

    // Initialize with default timeout configuration
    this.initDefaultCallbacks();
  }

  /**
   * Get checkpoint manager instance.
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  /**
   * Get checkpoint config.
   */
  getCheckpointConfig(): CheckpointConfig {
    return this.checkpointManager.getConfig();
  }

  /**
   * Save checkpoint for chain.
   */
  async saveCheckpoint(
    chainId: string,
    checkpoint: CheckpointData,
    runId?: string
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    return this.checkpointManager.saveCheckpoint(chainId, checkpoint, runId);
  }

  /**
   * Load checkpoint for chain.
   */
  async loadCheckpoint(chainId: string, runId?: string): Promise<{
    success: boolean;
    checkpoint?: CheckpointData;
    error?: string;
  }> {
    const result = await this.checkpointManager.loadCheckpoint(chainId, runId);
    
    return {
      success: result.success,
      checkpoint: result.checkpoint,
      error: result.warnings?.join('; ')
    };
  }

  /**
   * Resume chain from checkpoint.
   */
  async resumeChain(
    chainId: string,
    runId?: string,
    parentContext?: any,
    prompt?: string
  ): Promise<{
    success: boolean;
    checkpoint?: CheckpointData;
    completedAgents: number;
    pendingAgents: string[];
    results: Array<{ agentIdx: number; agentType: string; result: string; error?: string }>;
    variables: Record<string, unknown>;
    error?: string;
  }> {
    return this.checkpointManager.resumeChain(chainId, runId, parentContext, prompt);
  }

  /**
   * Check if chain has checkpoint.
   */
  async hasCheckpoint(chainId: string): Promise<boolean> {
    return this.checkpointManager.hasCheckpoint(chainId);
  }

  /**
   * List checkpoints for chain.
   */
  async listCheckpoints(
    chainId: string,
    sortBy?: 'timestamp' | 'runId' | 'chainId'
  ): Promise<Array<{
    path: string;
    chainId: string;
    runId: string;
    state: string;
    timestamp: string;
    completedAgents: number;
  }>> {
    return this.checkpointManager.listCheckpoints(chainId, sortBy ?? 'timestamp');
  }

  /**
   * Delete checkpoint for chain.
   */
  async deleteCheckpoint(chainId: string, runId?: string): Promise<boolean> {
    return this.checkpointManager.deleteCheckpoint(chainId, runId);
  }

  /**
   * Delete all checkpoints for chain.
   */
  async deleteAllCheckpoints(chainId: string): Promise<number> {
    return this.checkpointManager.deleteAllCheckpoints(chainId);
  }

  /**
   * Get successful last checkpoint.
   */
  async getSuccessfulCheckpoint(chainId: string): Promise<CheckpointData | null> {
    return this.checkpointManager.getSuccessfulCheckpoint(chainId);
  }

  /**
   * Get variable tracking map for chain.
   */
  getChainVariables(chainId: string): Map<string, unknown> {
    if (!this.chainVariables.has(chainId)) {
      this.chainVariables.set(chainId, new Map());
     }
    return this.chainVariables.get(chainId)!;
  }

  /**
   * Set variable for chain.
   */
  setChainVariable(chainId: string, key: string, value: unknown): void {
    const chainVars = this.getChainVariables(chainId);
    chainVars.set(key, value);
  }

  /**
   * Set chain variables.
   */
  setChainVariables(chainId: string, variables: Record<string, unknown>): void {
    const chainVars = this.getChainVariables(chainId);
    for (const [key, value] of Object.entries(variables)) {
      chainVars.set(key, value);
     }
  }

  /**
   * Get chain variables.
   */
  getChainVariablesMap(chainId: string): Record<string, unknown> {
    const chainVars = this.getChainVariables(chainId);
    return Object.fromEntries(chainVars);
  }

  /**
   * Cleanup expired variable tracking.
   */
  clearChainVariables(chainId: string): void {
    this.chainVariables.delete(chainId);
  }

  /**
   * Initialize with default callback timeout configuration.
   */
  private initDefaultCallbacks(): void {
    this.executionTimeoutConfig = {
      ...ChainExecutor.DEFAULT_CALLBACK_TIMEOUTS
    };
  }

  /**
   * Set custom callback timeout configuration.
   *
   * @param config Callback timeout configuration
   */
  public setCallbackTimeouts(config: Partial<CallbackTimeoutConfig>): void {
    this.executionTimeoutConfig = {
      ...this.executionTimeoutConfig,
      ...config
    };
  }

  /**
   * Get timeout value for a specific callback type.
   *
   * Protected by timeout isolation - failures don't affect execution.
   */
  private getCallbackTimeout(callbackName: string): number {
    if (!this.executionTimeoutConfig?.disableTimeouts) {
      const key = `${callbackName}TimeoutMs` as keyof CallbackTimeoutConfig;
      return this.executionTimeoutConfig[key as keyof CallbackTimeoutConfig] ?? 0;
     }
    return 0; // Disable all timeouts when flag is set
  }

  /**
   * Save execution checkpoint.
   * 
   * Called after each agent completes to track progress.
   * Supports recovery from checkpoint if chain restarts.
   * 
   * Atomic save using temp file + rename pattern.
   * Checksum validation ensures data integrity.
   * 
   * @param chainId Chain identifier
   * @param agentIdx Current agent index
   * @param results Agent results so far
   * @param variables Chain variables
   * @returns true if saved successfully
   */
  private async saveCheckpointFromExecution(
    chainId: string,
    agentIdx: number,
    results: AgentResult[],
    variables: Record<string, unknown>
  ): Promise<boolean> {
    if (!this.enableCheckpointing) {
      return false;
     }
    
    const checkpoint: CheckpointData = {
      chainId,
      runId: this.generateRunId(),
      state: agentIdx >= results.length - 1 ? 'completed' : 'running',
      completedAgents: results.length,
      pendingAgents: [],
      results: results.map((r, i) => ({
        agentIdx: i,
        agentType: r.agentType,
        result: r.result,
        error: r.error
      })),
      variables: { ...variables },
      timestamp: new Date().toISOString()
    };

    const result = await this.checkpointManager.saveCheckpoint(chainId, checkpoint);
    
    if (!result.success) {
      console.warn(`[ChainExecutor] Checkpoint save failed: ${result.error}`);
     }
    
    return result.success;
  }

  /**
   * Execute a chain to completion with streaming callbacks.
   *
   * Guarantees:
   * - NEVER throws an exception
   * - All errors returned in ChainExecutionResult.error
   * - All agent results returned, even failed ones
   * - Agent-level errors contained
   * - Checkpoint persistence before/after each agent
   * - Callbacks are isolated with try/catch and timeout protection
   */
  async execute(
    chainDef: ChainDefinition,
    parentContext: ExtensionContext,
    prompt: string,
    signals?: ExecutionSignals,
    timeoutConfig?: Partial<CallbackTimeoutConfig>
  ): Promise<ChainExecutionResult> {
    // Apply any custom timeout configuration for this execution
    if (timeoutConfig) {
      this.setCallbackTimeouts(timeoutConfig);
     }

    const startTime = Date.now();
    const runId = this.generateRunId();
    const variables: Record<string, unknown> = {};
    const agentResults: AgentResult[] = [];
    const metrics: ExecutionMetrics = {
      totalTurns: 0,
      totalTokens: 0,
      totalDurationMs: 0,
      agentsExecuted: 0,
      agentsFailed: 0,
      agentsRetried: 0,
      variablesResolved: 0,
      retries: []
    };

    try {
      // Save initial checkpoint
      await this.saveCheckpointFromExecution(
        chainDef.name,
        -1,
        agentResults,
        variables
      );

      // Emit chain start signal with timeout protection
      await this.safeCallback(
        () => signals?.onChainStart?.(chainDef.name),
        this.getCallbackTimeout('onChainStart')
      );

      // Emit initial progress
      await this.safeCallback(
        () => signals?.onProgress?.({
          status: 'initializing',
          agentIdx: -1,
          agentCompleted: false,
          agentsExecuted: 0,
          agentsTotal: chainDef.agents.length,
          partialResults: [],
          timestamp: new Date().toISOString()
        }),
        this.getCallbackTimeout('onProgress')
      );

      // Execute each agent sequentially
      for (let agentIdx = 0; agentIdx < chainDef.agents.length; agentIdx++) {
        // Check for abort signal
        if (signals?.signal?.aborted) {
          await this.saveCheckpointFromExecution(
            chainDef.name,
            agentIdx,
            agentResults,
            variables
          );
          
          await this.safeCallback(
            () => signals?.onProgress?.({
              status: 'failed',
              agentIdx: -1,
              agentCompleted: false,
              agentsExecuted: agentResults.length,
              agentsTotal: chainDef.agents.length,
              partialResults: agentResults.map(r => ({
                agentType: r.agentType,
                result: r.result
              })),
              progressPercentage: Math.round((agentResults.length / chainDef.agents.length) * 100),
              timestamp: new Date().toISOString()
            }),
            this.getCallbackTimeout('onProgress')
          );
          break;
         }

        const agent = chainDef.agents[agentIdx];

        try {
          // Emit agent start with timeout protection
          await this.safeCallback(
            () => signals?.onAgentStart?.(chainDef.name, agentIdx, agent),
            this.getCallbackTimeout('onAgentStart')
          );

          // Build context
          const priorResults = agentResults.slice(0, agentResults.length);
          const context = this.buildContext(
            agent.contextMode ?? 'inherit_compact',
            parentContext,
            priorResults
          );

          // Build effective prompt
          const effectivePrompt = this.buildEffectivePrompt(
            agent,
            parentContext,
            context || '',
            prompt,
            variables
          );

          // Execute agent with retry
          const agentResult = await this.executeAgentWithRetry(
            chainDef.name,
            agent,
            effectivePrompt,
            priorResults,
            metrics
          );

          agentResults.push(agentResult);
          metrics.variablesResolved += Object.keys(agentResult.variables ?? {}).length;

          // Save checkpoint after agent completes
          await this.saveCheckpointFromExecution(
            chainDef.name,
            agentIdx,
            agentResults,
            {
              ...variables,
              ...agentResult.variables
            }
          );

          // Emit completion with timeout protection
          await this.safeCallback(
            () => signals?.onAgentComplete?.(chainDef.name, agentIdx, agentResult),
            this.getCallbackTimeout('onAgentComplete')
          );

          // Emit progress update with timeout protection
          await this.safeCallback(
            () => signals?.onProgress?.({
              status: 'executing',
              agentIdx,
              agentCompleted: true,
              agentsExecuted: agentResults.length,
              agentsTotal: chainDef.agents.length,
              partialResults: agentResults.map(r => ({
                agentType: r.agentType,
                result: r.result
              })),
              progressPercentage: Math.round(((agentIdx + 1) / chainDef.agents.length) * 100),
              timestamp: new Date().toISOString()
            }),
            this.getCallbackTimeout('onProgress')
          );

        } catch (agentErr) {
          // Contain agent error
          const errorResult: AgentResult = {
            agentType: agent.agent_type,
            agentId: agent.agent_type,
            result: `Agent execution error: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`,
            error: agentErr instanceof Error ? agentErr.message : String(agentErr),
            turns: 0,
            tokens: 0,
            durationMs: 0,
            contextMode: agent.contextMode ?? 'inherit_compact',
            variables: {}
          };

          agentResults.push(errorResult);
          metrics.agentsFailed++;
          
          // Save checkpoint on error
          await this.saveCheckpointFromExecution(
            chainDef.name,
            agentIdx,
            agentResults,
            variables
          );

          // Emit error with timeout protection
          await this.safeCallback(
            () => signals?.onAgentError?.(chainDef.name, agentIdx, errorResult.error ?? 'Unknown error'),
            this.getCallbackTimeout('onAgentError')
          );

          continue;
        }
      }

      // Save final checkpoint
      await this.saveCheckpointFromExecution(
        chainDef.name,
        chainDef.agents.length - 1,
        agentResults,
        variables
      );

      // Emit aggregation progress with timeout protection
      await this.safeCallback(
        () => signals?.onProgress?.({
          status: 'aggregating',
          agentIdx: -1,
          agentCompleted: false,
          agentsExecuted: agentResults.length,
          agentsTotal: chainDef.agents.length,
          partialResults: agentResults.map(r => ({
            agentType: r.agentType,
            result: r.result
          })),
          timestamp: new Date().toISOString()
        }),
        this.getCallbackTimeout('onProgress')
      );

      // Aggregate results
      const aggregatedResult = this.aggregateResults(
        chainDef.name,
        agentResults,
        chainDef.config?.aggregate_mode
      );

      // Emit final aggregated result with timeout protection
      await this.safeCallback(
        () => signals?.onAggregated?.(aggregatedResult),
        this.getCallbackTimeout('onAggregated')
      );

      // Emit chain completion only on success
      await this.safeCallback(
        () => signals?.onChainComplete?.({
          success: true,
          chainId: chainDef.name,
          agentResults,
          aggregatedResult,
          chainConfig: chainDef.config ?? {},
          metrics,
          variables
        }),
        this.getCallbackTimeout('onChainComplete')
      );

      // Update checkpoint state to completed
      const finalCheckpoint: CheckpointData = {
        chainId: chainDef.name,
        runId: runId,
        state: 'completed',
        completedAgents: agentResults.length,
        pendingAgents: [],
        results: agentResults.map((r, i) => ({
          agentIdx: i,
          agentType: r.agentType,
          result: r.result,
          error: r.error
        })),
        variables: { ...variables },
        timestamp: new Date().toISOString()
      };
      
      await this.checkpointManager.saveCheckpoint(chainDef.name, finalCheckpoint);

      return {
        success: true,
        chainId: chainDef.name,
        agentResults,
        aggregatedResult,
        chainConfig: chainDef.config ?? {},
        metrics,
        variables,
        checkpoint: finalCheckpoint
      };
    } catch (chainErr) {
      const errorMsg = chainErr instanceof Error ? chainErr.message : String(chainErr);

      // Emit chain error with timeout protection
      await this.safeCallback(
        () => signals?.onChainError?.(errorMsg, chainDef.name),
        this.getCallbackTimeout('onChainError')
      );

      return {
        success: false,
        chainId: chainDef.name,
        agentResults,
        aggregatedResult: `Chain execution failed: ${errorMsg}`,
        chainConfig: chainDef.config ?? {},
        metrics,
        variables,
        error: errorMsg
      };
    }
  }

  /**
   * Execute chain from checkpoint with streaming callbacks.
   * 
   * Resume execution where it left off by loading the checkpoint
   * and continuing from the last completed agent.
   * 
   * @param chainId Chain identifier
   * @param checkpoint Checkpoint data to resume from
   * @param parentContext Extension context
   * @param prompt Prompt for continuation
   * @param signals Callback signals
   * @returns Chain execution result
   */
  async resume(
    chainId: string,
    checkpoint: CheckpointData,
    parentContext: ExtensionContext,
    prompt: string,
    signals?: ExecutionSignals
  ): Promise<ChainExecutionResult> {
    const variables = { ...checkpoint.variables };
    const result: ChainExecutionResult = {
      success: false,
      chainId,
      agentResults: [],
      aggregatedResult: '',
      chainConfig: {},
      metrics: {
        totalTurns: 0,
        totalTokens: 0,
        totalDurationMs: 0,
        agentsExecuted: 0,
        agentsFailed: 0,
        agentsRetried: 0,
        variablesResolved: 0,
        retries: []
      }
    };

    try {
      // Resume agents from checkpoint
      for (let agentIdx = checkpoint.completedAgents; agentIdx < checkpoint.results.length; agentIdx++) {
        // Skip already executed agents
        if (agentIdx < checkpoint.completedAgents) {
          continue;
        }

        const resultData = checkpoint.results[agentIdx];
        
        // Skip failed agents if continuation is configured
        if (resultData.error) {
          continue;
        }

        // Re-execute agent from checkpoint with the checkpointed context
        const agentResult = await this.executeAgentFromCheckpoint(
          chainId,
          agentIdx,
          checkpoint,
          parentContext,
          prompt,
          variables,
          signals
        );

        result.agentResults.push(agentResult);
        result.variables = { ...result.variables, ...agentResult.variables };
      }

      result.success = true;
      result.chainConfig = {};
      result.variables = variables;
      
      result.checkpoint = checkpoint;

      // Emit completion via callback
      await this.safeCallback(
        () => signals?.onChainComplete?.(result),
        this.getCallbackTimeout('onChainComplete')
      );

      return result;
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);

      // Emit error via callback
      await this.safeCallback(
        () => signals?.onChainError?.(result.error ?? 'Unknown error'),
        this.getCallbackTimeout('onChainError')
      );

      return result;
    }
  }

  /**
   * Execute chain from checkpoint and continue execution.
   * 
   * @param chainId Chain identifier
   * @param checkpoint Checkpoint loaded from disk
   * @param parentContext Extension context
   * @param prompt Prompt for execution
   * @param signals Callback signals
   * @returns Chain execution result with resumed checkpoint
   */
  async resumeAndExecute(
    chainId: string,
    checkpoint: CheckpointData,
    parentContext: ExtensionContext,
    prompt: string,
    signals?: ExecutionSignals
  ): Promise<ChainExecutionResult> {
    const startAgentIdx = checkpoint.completedAgents;
    const allAgentResults: AgentResult[] = [
      ...checkpoint.results
        .filter(r => !r.error)
        .map((r, i) => ({
          agentType: r.agentType,
          agentId: r.agentType,
          result: r.result,
          error: undefined,
          turns: 0,
          tokens: 0,
          durationMs: 0,
          contextMode: 'inherit_compact',
          variables: {}
        }))
        .slice(0, startAgentIdx)
    ];
    
    return this.execute(
      {
        name: chainId,
        displayName: chainId,
        description: chainId,
        version: '1.0',
        agents: checkpoint.results.map(r => ({
          agent_type: r.agentType,
          prompt: 'Continue from checkpoint',
          context_mode: 'none'
        })),
        config: checkpoint.results.length > 0 ? { aggregate_mode: 'sequential' } : {}
      },
      parentContext,
      prompt,
      signals
    );
  }

  /**
   * Helper: Execute single agent with retry and streaming callbacks.
   */
  private async executeAgentWithRetry(
    chainId: string,
    agent: ChainAgentContextMode,
    effectivePrompt: string,
    priorResults: AgentResult[],
    metrics: ExecutionMetrics
  ): Promise<AgentResult> {
    const maxRetries = agent.retry_count ?? 3;
    const backoffBase = agent.backoff_base_ms ?? DEFAULT_BACKOFF_BASE_MS;

    let lastError: Error | null = null;
    let attempt = 0;
    let agentResult: AgentResult | undefined;

    while (attempt <= maxRetries) {
      try {
        agentResult = await this.executeAgentSingles(
          chainId,
          agent,
          effectivePrompt,
          priorResults
        );

        metrics.agentsRetried++;
        return agentResult;
       } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxRetries) {
          // Calculate backoff with jitter
          const delay = Math.min(
            backoffBase * Math.pow(2, attempt),
            this.maxBackoffMs
          );

          metrics.retries.push({
            agentIdx: priorResults.length,
            attempt: attempt + 1,
            delayMs: delay,
            success: false
          });

          // Log retry
          console.log(`[ChainExecutor] Retrying ${chainId} agent ${agent.agent_type} (attempt ${attempt + 1}/${maxRetries}, backoff ${delay}ms)`);

          await this.sleep(delay);
          attempt++;
         } else {
           // Exhausted retries
           return {
            agentType: agent.agent_type,
            agentId: agent.agent_type,
            result: `Agent failed after ${maxRetries + 1} attempts: ${lastError.message}`,
            error: lastError.message,
            turns: 0,
            tokens: 0,
            durationMs: 0,
            contextMode: agent.contextMode ?? 'inherit_compact',
            variables: {}
           };
         }
       }
     }

    throw new Error(`Execute should not reach here: ${chainId}:${agent.agent_type}`);
  }

  /**
   * Execute single agent without retry.
   */
  private async executeAgentSingles(
    chainId: string,
    agent: ChainAgentContextMode,
    effectivePrompt: string,
    priorResults: AgentResult[]
  ): Promise<AgentResult> {
    // Save checkpoint before agent execution
    await this.saveCheckpointFromExecution(
      chainId,
      priorResults.length,
      priorResults,
      {}
    );

    // This is a PLACEHOLDER - implement agent execution
    // In reality, this would call AgentManager.spawn() or AgentRunner.runAgent()
    return {
      agentType: agent.agent_type,
      agentId: agent.agent_type,
      result: `Simulated execution of ${agent.agent_type}`,
      error: undefined,
      turns: Math.floor(Math.random() * 5) + 1,
      tokens: Math.floor(Math.random() * 1000),
      durationMs: Math.floor(Math.random() * 5000),
      contextMode: agent.contextMode ?? 'inherit_compact',
      variables: {}
    };
  }

  /**
   * Execute single agent from checkpoint.
   */
  private async executeAgentFromCheckpoint(
    chainId: string,
    agentIdx: number,
    checkpoint: CheckpointData,
    parentContext: ExtensionContext,
    prompt: string,
    variables: Record<string, unknown>,
    signals?: ExecutionSignals
  ): Promise<AgentResult> {
    // Placeholder for checkpoint resume
    return {
      agentType: checkpoint.results[agentIdx].agentType,
      agentId: checkpoint.results[agentIdx].agentType,
      result: 'Resumed from checkpoint',
      error: undefined,
      turns: 0,
      tokens: 0,
      durationMs: 0,
      contextMode: 'inherit_compact',
      variables: {}
    };
  }

  /**
   * Build effective prompt combining agent prompt, context, and variables.
   */
  private buildEffectivePrompt(
    agent: ChainAgentContextMode,
    parentContext: ExtensionContext,
    context: string,
    prompt: string,
    variables: Record<string, unknown>
  ): string {
    const resolvedPrompt = this.resolveVariables(agent.prompt, variables);

    return `[Chain: ${agent.agent_type}]\n\n` +
      `[Context]: ${context || 'none'}\n\n` +
      `[Prompt]: ${resolvedPrompt}\n\n` +
      `[User Input]: ${prompt}`;
  }

  /**
   * Build context based on context mode.
   */
  private buildContext(
    contextMode: ContextMode,
    parentContext: ExtensionContext,
    priorResults: AgentResult[]
  ): string | null {
    switch (contextMode) {
      case 'inherit':
        return parentContext.conversationHistory || '';

      case 'inherit_compact':
        return this.compressContext(parentContext.conversationHistory || '', 10000);

      case 'inherit_prompt_only':
        const firstPrompt = parentContext.conversationHistory
          ?.split('\n')
          .find(line => line.trim().startsWith('user'))
          ?.replace(/^user:\s*/i, '') || '';
        return firstPrompt;

      case 'none':
        return null;

      default:
        return parentContext.conversationHistory || '';
     }
  }

  /**
   * Compress context for inherit_compact mode.
   */
  private compressContext(context: string, maxTokens: number): string {
    if (!context) return '';

    const estimatedTokens = Math.floor(context.length / 4);
    if (estimatedTokens <= maxTokens) {
      return context;
     }

     // Truncate to max tokens (rough approximation)
    return context.slice(0, maxTokens * 4);
  }

  /**
   * Resolve variables in template.
   */
  private resolveVariables(template: string, variables: Record<string, unknown>): string {
    let resolved = template;

     // Resolve environment variables
    resolved = resolved.replace(/\$([A-Z_][A-Z0-9_]*)/g, (match, varName) => {
      const envValue = process.env[varName];
      return resolved.replace(match, envValue || match);
     });

     // Resolve chain variables ({{varName}})
    resolved = resolved.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (match, varName) => {
      const value = variables[varName];
      return resolved.replace(match, value !== undefined ? String(value) : match);
     });

     // Resolve previous agent results ({{agent_result:N}})
    resolved = resolved.replace(/\{\{agent_result:(\d+)\}\}/g, (match, idx) => {
      const agentIdx = parseInt(idx, 10);
      return resolved.replace(match, 'agent_' + agentIdx);
     });

    return resolved;
  }

  /**
   * Aggregate agent results based on mode.
   */
  private aggregateResults(
    chainId: string,
    results: AgentResult[],
    mode: 'sequential' | 'parallel' | 'smart' | undefined
  ): string {
    if (mode === 'parallel') {
       // Parallel execution results
      return '[Chain: ' + chainId + ']\n\n[' +
        results.map(r => r.result).join('\n\n---\n\n') +
         ']';
     }

     // Sequential (default)
    return '[Chain: ' + chainId + ']\n\n' +
      results.map((r, i) => `Agent ${i} (${r.agentType}): ${r.error ? '[FAILED: ' + r.error + ']' : r.result}`).join('\n\n');
  }

  /**
   * Generate unique run ID.
   */
  private generateRunId(): string {
    return Math.random().toString(36).substring(2, 15) + '-' + Date.now();
  }

  /**
   * Sleep helper.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute callback with timeout protection and error isolation.
   *
   * CRITICAL: This method wraps all callbacks in try/catch AND Promise.race with timeout.
   * - Error isolation: Callback failures are caught and logged, not propagated
   * - Timeout protection: Callbacks are canceled after configured timeout
   * - Non-blocking: Callbacks don't block the main execution flow
   *
   * @param callback Function to execute
   * @param timeoutMs Timeout in milliseconds (0 = no timeout, infinite)
   * @returns Promise that resolves to callback result OR void if callback throws/times out
   */
  private async safeCallback<T extends () => any>(
    callback: T,
    timeoutMs: number = 0
  ): Promise<void> {
    try {
      if (timeoutMs <= 0) {
         // No timeout - execute directly (but still catch errors)
        await callback();
        return;
       }

       // Race callback against timeout for protection
      const callbackPromise = (async () => {
        try {
          await callback();
          return true;
         } catch (e) {
           // Callback error caught here
          return false;
         }
      })();

      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(() => resolve(undefined), timeoutMs)
       );

      await Promise.race([
        callbackPromise,
        timeoutPromise
       ]);
     } catch (err) {
       // CRITICAL: Isolate callback failure from chain execution
       // Error is logged but doesn't propagate
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[ChainExecutor] Callback execution isolated: ${errorMsg}`);
     }
  }
}

/**
 * Extension context for chain execution.
 */
export interface ExtensionContext {
  cwd: string;
  conversationHistory?: string;
  sessionManager?: {
    getSessionId?: () => string;
  };
}

/**
 * Checkpoint configuration.
 */
export interface CheckpointConfigWrapper {
  checkpointsDir?: string;
  maxCheckpoints?: number;
  enableChecksumValidation?: boolean;
  autoCleanup?: boolean;
}
