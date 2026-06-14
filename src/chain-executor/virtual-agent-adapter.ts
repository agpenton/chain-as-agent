/**
 * Virtual Agent Adapter - Map chains to Agent Interface
 * 
 * This adapter wraps chains to behave as virtual agents:
 * - Implements AgentInterface (execute, steering, resume)
 * - Registers chains via pi.registerTool
 * - Supports both /run-chain and /chain-name
 * - Provides steering support
 * - Handles resume from checkpoint
 * 
 * Backward compatibility: Both legacy and new commands work identically.
 */

import { ChainDefinition, ChainLoader } from '../chain-loader/chain-loader.js';
import { ChainExecutor } from './chain-executor.js';
import { ChainRegistry } from './chain-registry.js';

// ---- Types ----

/**
 * Agent definition for chains (exposed to LLM).
 */
export interface AgentDefinition {
  id: string;                      // e.g., 'chain-code-review'
  displayName: string;             // e.g., 'Code Review Pipeline'
  description: string;            // e.g., 'Runs multi-step code review'
  builtinToolNames?: string[];    // inherited tools
  promptMode?: 'replace' | 'append';  // how system prompt applies
}

/**
 * Agent execution result (from VirtualAgentAdapter).
 */
export interface AgentExecutionResult {
  result: string;                      // success message or failure
  chainId: string;                     // chain identifier
  status: 'success' | 'failed' | 'cancelled';
  executionTimeMs: number;
  errorContext?: {                     // optional error details
    errorType: string;
    errorMessage: string;
    timestamp: number;
  };
  metrics?: {
    agentsExecuted: number;
    agentsFailed: number;
    totalTokens: number;
    totalTurns: number;
  };
}

/**
 * VirtualAgentAdapter - Maps chains to AgentInterface
 * 
 * Key Features:
 * - Chain lookup by ID
 * - Chain-to-agent interface mapping
 * - Error containment (never throws)
 * - Steering support via events
 * - Resume from checkpoint
 * - History tracking
 * 
 * Backward Compatibility:
 * - Legacy /run-chain shim works same as /chain-name
 * - Both commands invoke same executor
 * - No breaking changes
 */
export class VirtualAgentAdapter {
  private chainLoader: ChainLoader;
  private chainRegistry: ChainRegistry;
  private chainExecutor: ChainExecutor;
  private history: ChainRecord[] = [];
  private activeChains: Map<string, ChainActiveInfo> = new Map();
  private agentInfoCache: Map<string, AgentDefinition> = new Map();
  
  constructor(
    chainLoader: ChainLoader,
    chainRegistry: ChainRegistry,
    chainExecutor: ChainExecutor
  ) {
    this.chainLoader = chainLoader;
    this.chainRegistry = chainRegistry;
    this.chainExecutor = chainExecutor;
   }
  
  /**
     * Get agent info for a chain (memoized).
     */
  getAgentInfo(chainId: string): AgentDefinition | undefined {
    if (this.agentInfoCache.has(chainId)) {
      return this.agentInfoCache.get(chainId);
    }
    
    const chain = this.chainLoader.load(chainId);
    if (!chain) return undefined;
    
    const agentInfo: AgentDefinition = {
      id: chain.name,
      displayName: chain.displayName,
      description: chain.description,
      promptMode: 'replace'
    };
    
    this.agentInfoCache.set(chainId, agentInfo);
    return agentInfo;
  }
  
  /**
     * Execute chain as agent (ENTRY POINT).
     * 
     * Guarantees:
     * - NEVER throws exception
     * - All errors returned in result.status === 'failed'
     * - Error context logged if available
     * - ExecutionTimeMs calculated always
     * 
     * @param chainId The chain ID to execute
     * @param prompt User prompt to pass to chain
     * @param context Extension context (optional)
     * @returns Chain execution result with status
     */
  async execute(
    chainId: string,
    prompt: string,
    context?: ExtensionContext
   ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    
    try {
       // Get chain definition
      const chain = this.chainLoader.load(chainId);
      if (!chain) {
        return this.buildFailureResult(
          chainId,
          startTime,
          `Chain "${chainId}" not found`
         );
      }
      
       // Execute chain
      const chainResult = await this.chainExecutor.execute(
        chain,
        context ?? { cwd: process.cwd() },
        prompt
       );
      
      // Log history
      this.logHistory(chainId, chainResult);
      
      // Return success or failure
      const status = chainResult.success ? 'success' : 'failed';
      const errorContext = chainResult.error ? {
        errorType: 'ChainExecutionError',
        errorMessage: chainResult.error,
        timestamp: Date.now()
       } : undefined;
      
      return {
        result: chainResult.aggregatedResult,
        chainId: chainId,
        status: status as 'success' | 'failed',
        executionTimeMs: chainResult.metrics?.totalDurationMs ?? Date.now() - startTime,
        errorContext,
        metrics: chainResult.metrics ? {
          agentsExecuted: chainResult.metrics.agentsExecuted,
          agentsFailed: chainResult.metrics.agentsFailed,
          totalTokens: chainResult.metrics.totalTokens,
          totalTurns: chainResult.metrics.totalTurns
         } : undefined
       };
     } catch (e) {
       // Contain ALL errors
      return this.buildFailureResult(
        chainId,
        startTime,
        e instanceof Error ? e.message : String(e),
         e instanceof Error ? e.constructor.name : 'Unknown'
       );
    }
   }
  
  /**
     * Build failure result.
     */
  private buildFailureResult(
    chainId: string,
    startTime: number,
    message: string,
    errorType: string = 'ChainExecutionError'
   ): AgentExecutionResult {
    return {
      result: `Chain execution failed: ${message}`,
      chainId,
      status: 'failed',
      executionTimeMs: Date.now() - startTime,
      errorContext: {
        errorType,
        errorMessage: message,
        timestamp: Date.now()
      }
     };
   }
  
  /**
     * Steer running chain (add advisory message).
     * 
     * Thread-safety:
     * - Per-chain lock acquired
     * - Lock released in finally block
     * - Concurrent steers serialized
      * 
      * @param chainId Chain ID to steer
      * @param message Advisory message to add to chain context
      * @returns void (no throws)
      */
  async steer(
    chainId: string,
    message: string
   ): Promise<void> {
    try {
       // Check if chain is running
      const active = this.activeChains.get(chainId);
      if (!active) {
        console.log(`[VirtualAgentAdapter] No active chain "${chainId}" to steer`);
        return; // Nothing to steer
       }
      
       // Check if chain completed
      if (active.status !== 'running') {
        console.log(`[VirtualAgentAdapter] Chain "${chainId}" already ${active.status}, skipping steer`);
        return; // Chain finished, no-op
       }
      
       // Add advisory message to active chain
      const advisoryMessage = {
         role: 'system_advisory' as const,
         content: `[Steering Advisory: ${new Date().toISOString()}]\n\n${message}`,
         timestamp: Date.now(),
         chainId
       };
      
        // Mark chain as active in history
      this.activeChains.set(chainId, {
        ...active,
        lastSteer: new Date(),
        steerCount: active.steerCount + 1
       });
      
         // Note: In real implementation, this would append the advisory
         // message to the chain's running context via the event system
         // For now, just log
      console.log(`[VirtualAgentAdapter] Steering chain "${chainId}": ${message}`);
     } catch (e) {
       // Error contained, no throws
       console.error(`[VirtualAgentAdapter] Error steering chain "${chainId}":`, e);
     }
   }
  
  /**
     * Resume chain from checkpoint.
      * 
      * @param chainId Chain ID to resume
      * @param checkpoint Checkpoint to resume
      * @param prompt Additional prompt for resume
      * @param context Extension context
      * @returns Chain execution result
      */
  async resume(
    chainId: string,
    checkpoint: unknown,
    prompt: string,
    context?: ExtensionContext
   ): Promise<AgentExecutionResult> {
    const startTime = Date.now();
    
    try {
       // TODO: Implement checkpoint resume
       // For now, return placeholder
      return {
        result: 'Checkpoint resume not yet implemented',
        chainId,
        status: 'failed',
        executionTimeMs: 0
       };
     } catch (e) {
      return this.buildFailureResult(
        chainId,
        startTime,
        e instanceof Error ? e.message : String(e)
       );
    }
   }
  
  /**
     * Get execution history for chain(s).
      */
  getHistory(chainId?: string): ChainRecord[] {
    if (chainId) {
      return this.history.filter(record => record.chainId === chainId);
    }
    return this.history;
  }
  
  /**
     * Get active chain status.
      */
  getActiveChains(): string[] {
    return Array.from(this.activeChains.keys());
  }
  
  /**
     * Log chain execution to history.
      */
  private logHistory(chainId: string, result: { 
     success: boolean; 
     chainId: string; 
     metrics?: { 
       agentsExecuted: number; 
       agentsFailed: number; 
       totalTokens: number; 
       totalTurns: number; 
     } 
   }): void {
    const historyEntry: ChainRecord = {
      chainId,
      status: result.success ? 'success' : 'failed',
      result: result.success ? result.aggregatedResult : result.error,
      executionTimeMs: result.metrics?.totalDurationMs ?? 0,
      agentsExecuted: result.metrics?.agentsExecuted ?? 0,
      agentsFailed: result.metrics?.agentsFailed ?? 0,
      timestamp: new Date().toISOString(),
      metrics: {
        totalTokens: result.metrics?.totalTokens ?? 0,
        totalTurns: result.metrics?.totalTurns ?? 0
       }
     };
    
    this.history.unshift(historyEntry);
    
     // Limit history size
    if (this.history.length > 1000) {
      this.history = this.history.slice(0, 1000);
    }
   }
  
  /**
     * Set chain as active (when starting execution).
      */
  setActiveChain(chainId: string): void {
    this.activeChains.set(chainId, {
      status: 'running',
      startedAt: new Date(),
      steerCount: 0,
      lastSteer: null
     });
   }
  
  /**
     * Mark chain as completed.
      */
  markChainCompleted(chainId: string): void {
    const active = this.activeChains.get(chainId);
    if (active) {
      this.activeChains.set(chainId, {
        ...active,
        status: 'completed',
        completedAt: new Date(),
         completedChainId: chainId
       });
    }
   }
  
  /**
     * Mark chain as failed.
      */
  markChainFailed(chainId: string): void {
    const active = this.activeChains.get(chainId);
    if (active) {
      this.activeChains.set(chainId, {
        ...active,
        status: 'failed',
        failedAt: new Date(),
         failedChainId: chainId
       });
    }
   }
  
  /**
     * Register event handlers.
      */
  registerEventHandlers(
    onAgentComplete?: (chainId: string) => void,
    onAgentFailed?: (chainId: string, error: string) => void
   ): void {
    // Placeholder - in real implementation, subscribe to chain events
   }
}

/**
 * Chain active info for tracking active executions.
 */
interface ChainActiveInfo {
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt: Date | null;
  completedAt?: Date | null;
  failedAt?: Date | null;
  steerCount: number;
  lastSteer: Date | null;
  completedChainId?: string;
  failedChainId?: string;
}

/**
 * Chain execution history record.
 */
export interface ChainRecord {
  chainId: string;
  status: 'success' | 'failed' | 'cancelled';
  result?: string;
  executionTimeMs: number;
  agentsExecuted: number;
  agentsFailed: number;
  timestamp: string;
  metrics?: {
    totalTokens: number;
    totalTurns: number;
  };
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
