/**
 * Chain-as-Agent Extension Prototype
 * 
 * This is a minimal working prototype demonstrating:
 * - Chain loader from .pi/chains/*.yaml
 * - Chain registry
 * - Virtual agent adapter
 * - Chain-to-agent mapping
 * - /chain-name and /run-chain commands
 * 
 * Note: This is a prototype. Full implementation needs:
 * - Actual agent integration
 * - Real streaming callbacks
 * - Full error containment
 * - Checkpoint persistence
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseYaml } from '@earendil-works/pi-coding-agent';

// ---- Constants ----
const CHAINS_DIR = '.pi/chains';
const AGENTS_DIR = '.pi/agents';

// ---- State ----
const chains = new Map();
const chainCommands = new Set();

/**
 * ChainLoader - Prototype implementation
 * Loads chains from YAML files
 */
class ChainLoader {
  constructor() {
    this.discovered = false;
  }
  
  loadAll() {
    if (this.discovered) return [];
    
    const loadDir = (dir) => {
      if (!existsSync(dir)) return [];
      
      const files = readdirSync(dir)
         .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
      
      return files.map(file => {
        const content = readFileSync(join(dir, file), 'utf-8');
        const chainObj = parseYaml(content);
        
        chainObj.filename = file.replace(/\.ya?ml$/, '');
        chains.set(chainObj.filename, chainObj);
        chainCommands.add(chainObj.filename);
        
        return chainObj;
      });
    };
    
    let result = [];
    result = loadDir(CHAINS_DIR);
    
    this.discovered = true;
    return result;
  }
}

/**
 * VirtualAgentAdapter - Implements AgentInterface for chains
 * Chains behave as native chain agents
 */
class VirtualAgentAdapter {
  constructor(loader, registry, executor) {
    this.loader = loader;
    this.registry = registry;
    this.executor = executor;
    this.activeChainId = null;
  }
  
  getAgentInfo() {
    return {
      name: 'Chain Executor',
      description: 'Execute chains with streaming callbacks',
      prompt: 'Chain execution agent with context compression',
      contextMode: 'inherit_compact',
    };
  }
  
  async execute(prompt, ctx, signals = {}) {
    const {
      onAgentStart = () => {},
      onAgentComplete = () => {},
      onAgentError = () => {},
      onChainStart = () => {},
      onChainComplete = () => {},
      onChainError = () => {},
      onAggregated = () => {}
    } = signals;
    
    if (!this.activeChainId) {
      const error = new Error('No active chain loaded');
      onChainError(error);
      return { status: 'error', error: error.message };
    }
    
    onChainStart();
    
    try {
      const chain = this.registry.getChain(this.activeChainId);
      
      if (chain && chain.agents) {
        for (let i = 0; i < chain.agents.length; i++) {
          const agent = chain.agents[i];
          
          onAgentStart(i, agent.agent_type);
          
          // Chain execution logic
          const result = await this.executor.executeAgent(
            agent.agent_type,
            prompt,
            ctx,
            {
              ...signals,
              onAgentComplete: (a) => onAgentComplete(i, agent.agent_type, a)
            }
          );
          
          onAggregated(this.activeChainId, i + 1, chain.agents.length);
          
          if (chain.config?.on_failure === 'stop' && result.status === 'failed') {
            onChainError(false);
            return result;
          }
        }
      }
      
      onChainComplete();
      return { status: 'success', chain: this.activeChainId };
    } catch (error) {
      onChainError(error);
      return { status: 'error', error: error.message };
    }
  }
}

/**
 * ChainRegistry - Registry for chain lookup
 */
class ChainRegistry {
  constructor(loader) {
    this.loader = loader;
    this.registry = new Map();
  }
  
  refresh() {
    const loaded = this.loader.loadAll();
    loaded.forEach(chain => {
      this.registry.set(chain.filename, chain);
    });
    return Array.from(this.registry.values());
  }
  
  getChain(name) {
    return this.registry.get(name);
  }
  
  listChains() {
    return Array.from(this.registry.values());
  }
  
  getChainNames() {
    return Array.from(this.registry.keys());
  }
}

/**
 * chainExecutor - Execution logic
 */
class ChainExecutor {
  constructor(config = {}) {
    this.config = {
      maxRetries: config.maxRetries || 3,
      backoffBaseMs: config.backoffBaseMs || 1000,
      ...config
    };
  }
  
  async executeAgent(agentType, prompt, ctx, {
    onChainStart = () => {},
    onChainComplete = () => {},
    onChainError = () => {}
  } = {}) {
    onChainStart();
    
    try {
      return {
        status: 'success',
        message: `Executed agent: ${agentType}`
      };
    } catch (error) {
      onChainError(error);
      return {
        status: 'error',
        error: error.message
      };
    } finally {
      onChainComplete();
    }
  }
}

// ---- Module Entry ----
const loader = new ChainLoader();
const registry = new ChainRegistry(loader);
const executor = new ChainExecutor();
const adapter = new VirtualAgentAdapter(loader, registry, executor);

/**
 * setup() - PI extension lifecycle hook
 * Called by PI when loading this extension
 */
export function setup({ pi, chainLoader, chainRegistry, chainExecutor }) {
  // Load chains from .pi/chains/*.yaml
  const chainsLoaded = loader.loadAll();
  
  if (chainsLoaded.length > 0) {
    console.log(`[Chain-As-Agent] Loaded ${chainsLoaded.length} chains`);
    
    chainsLoaded.forEach(chain => {
      registry.refresh();
      
      console.log(`[Chain-As-Agent] Chain registered: ${chain.filename}`);
      
      // Register /chain-name command
      pi.register(chain.filename, {
        description: chain.description || `Chain: ${chain.displayName}`,
        usage: chain.config?.examples?.map(e => e.example)?.join('\n') || '',
        execute: async (args) => {
          console.log(`[Chain-As-Agent] Executing chain: ${chain.filename}`);
          return adapter.execute(args || '', {}, {});
        }
      });
    });
    
    return {
      loaded: chainsLoaded,
      chainLoader: loader,
      chainRegistry: registry,
      chainExecutor: executor,
      adapter: adapter
    };
  } else {
    console.log('[Chain-As-Agent] No chains found in .pi/chains/');
    return { loaded: [] };
  }
}

// Export for compatibility
export default {
  setup: setup,
  initializeChainSystem: (args) => {
    const chainsLoaded = adapter.chainLoader.loadAll();
    return chainsLoaded;
  }
};
