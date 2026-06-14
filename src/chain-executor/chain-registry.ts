/**
 * Chain Registry - Global registry of chain definitions
 * 
 * Responsibilities:
 * - Load chains from .pi/chains/*.yaml
 * - Cache parsed chain definitions
 * - Validate chain consistency
 * - Provide lookup APIs
 * - Handle chain reloads
 * - Subscribe to chain changes
 * 
 * Chains discovered from .pi/chains/*.yaml or .pi/agents/*.md.
 */

import { ChainDefinition, ChainLoader } from '../chain-loader/chain-loader.js';

// ---- Types ----

/**
 * Chain event types.
 */
export type ChainEvent = 
  | { type: 'chain_loaded'; chainId: string }
  | { type: 'chain_unloaded'; chainId: string }
  | { type: 'chain_updated'; chainId: string }
  | { type: 'chain_error'; chainId: string; error: string };

/**
 * Chain registry subscriber callback.
 */
export type ChainEventCallback = (event: ChainEvent) => void;

/**
 * Unsubscribe function.
 */
export type UnsubscribeFn = () => void;

/**
 * ChainRegistry - Global chain discovery and lookup
 * 
 * API Surface:
 * - getChain(chainId) - Lookup by ID
 * - listChains() - List all chains
 * - getChainNames() - Get chain IDs for tool descriptions
 * - refresh() - Reload chains from disk
 * - subscribe(callback) - Subscribe to chain events
 * 
 * All discovered chains are validated at load time.
 */
export class ChainRegistry {
  private chains: Map<string, ChainDefinition> = new Map();
  private subscribers: ChainEventCallback[] = [];
  private chainLoader: ChainLoader;
  private loadedFiles: Set<string> = new Set();
  
  constructor() {
    // Chain loader already initialized
    }
  
  /**
     * Get chain by ID.
      */
  getChain(chainId: string): ChainDefinition | undefined {
    return this.chains.get(chainId);
    }
  
  /**
     * List all available chains.
      */
  listChains(): ChainDefinition[] {
    return Array.from(this.chains.values());
    }
  
  /**
     * Get chain names for tool descriptions.
      */
  getChainNames(): string[] {
    return this.listChains().map(c => c.name);
    }
  
  /**
     * Refresh chains from disk.
      */
  async refresh(): Promise<void> {
    const previousChainIds = new Set(this.chains.keys());
    
    // Load all chains
    const loadedChains = await this.chainLoader.loadAll();
    
    // Clear existing
    this.chains.clear();
    
    // Load new chains
    for (const chain of loadedChains) {
      this.chains.set(chain.name, chain);
      this.loadedFiles.add(`.${chain.name}`);
      
       // Emit event
      this.emitEvent({ type: 'chain_loaded', chainId: chain.name });
      
       // Check if previously existing
      if (previousChainIds.has(chain.name)) {
        this.emitEvent({ type: 'chain_updated', chainId: chain.name });
      }
     }
    
    // Mark unloaded chains
    for (const chainId of previousChainIds) {
      if (!this.chains.has(chainId)) {
        this.emitEvent({ type: 'chain_unloaded', chainId });
      }
    }
    }
  
  /**
     * Subscribe to chain events.
      */
  subscribe(callback: ChainEventCallback): UnsubscribeFn {
    this.subscribers.push(callback);
    
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
      };
    }
  
  /**
     * Emit chain event to all subscribers.
      */
  private emitEvent(event: ChainEvent): void {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
        } catch (err) {
        console.error('[ChainRegistry] Error emitting event:', err);
         // Continue with other subscribers
        }
      }
    }
  
  /**
     * Get chains for specific agent type.
      */
  getChainsForAgent(agentType: string): ChainDefinition[] {
    return this.listChains().filter(chain => {
       const firstAgent = chain.agents[0];
       return firstAgent?.agent_type === agentType;
      });
    }
  
  /**
     * Validate all chains.
      */
  validateAll(): {
     valid: ChainDefinition[];
     invalid: Array<{ chain?: ChainDefinition; errors: string[] }>;
     } {
    const valid: ChainDefinition[] = [];
    const invalid: Array<{ chain?: ChainDefinition; errors: string[] }> = [];
    
    for (const chain of this.chains.values()) {
      const validation = this.chainLoader.validate(chain.name);
      if (validation.valid) {
        valid.push(chain);
      } else {
        invalid.push({ chain, errors: validation.errors });
        this.emitEvent({
          type: 'chain_error',
          chainId: chain.name,
          error: validation.errors.join(', ')
          });
       }
     }
    
    return { valid, invalid };
    }
  
  /**
     * Check if chain exists.
      */
  hasChain(chainId: string): boolean {
    return this.chains.has(chainId);
    }
  
  /**
     * Get chain count.
      */
  getChainCount(): number {
    return this.chains.size;
    }
  
  /**
     * Get chain source path (internal).
      */
  getChainSourcePath(chainId: string): string | undefined {
    const chain = this.chains.get(chainId);
    return chain ? `.${chainId}` : undefined;
    }
}
