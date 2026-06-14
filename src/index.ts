/**
 * Chain-as-Agent Extension Entry Point
 * 
 * This module:
 * - Initializes chain loader
 * - Registers /chain-name commands for all chains
 * - Provides backward-compatible /run-chain shim
 * - Implements steering via virtual agent adapter
 * - Maintains native execution lifecycle
 * 
 * Design Principles:
 * - No breaking changes to existing APIs
 * - Preserve native execution semantics
 * - Preserve streaming behavior
 * - Preserve context propagation
 * - Backward compatibility via /run-chain shim
 */

import { ChainLoader } from './chain-loader/chain-loader.js';
import { ChainExecutor } from './chain-executor/chain-executor.js';
import { VirtualAgentAdapter } from './chain-executor/virtual-agent-adapter.js';
import { ChainRegistry } from './chain-executor/chain-registry.js';

// ---- Module State ----

let chainLoader: ChainLoader | null = null;
let chainRegistry: ChainRegistry | null = null;
let chainExecutor: ChainExecutor | null = null;
let virtualAgentAdapter: VirtualAgentAdapter | null = null;

/**
 * Initialize chain system.
 * 
 * Called once at plugin load time.
 * Discovers chains from .pi/chains/*.yaml
 */
export function initialize(): void {
  console.log('[Chain-As-Agent] Initializing Chain-As-Agent extension...');
  
  // Create chain loader
  chainLoader = new ChainLoader('.pi/chains');
  chainLoader.setOnChainLoad((chainId: string) => {
    console.log(`[Chain-As-Agent] Chain loaded: ${chainId}`);
  });
  chainLoader.setOnChainError((chainId: string, error: Error) => {
    console.error(`[Chain-As-Agent] Chain load error for ${chainId}:`, error);
  });
  
  // Load chains
  chainLoader.loadAll().then(chains => {
    console.log(`[Chain-As-Agent] Loaded ${chains.length} chains`);
  }).catch(err => {
    console.warn('[Chain-As-Agent] Chain load failed:', err);
  });
  
  // Create chain registry
  chainRegistry = new ChainRegistry(chainLoader);
  
  // Register chains from file
  chainRegistry.refresh().catch(err => {
    console.warn('[Chain-As-Agent] Chain registry refresh failed:', err);
  });
  
  // Create chain executor
  chainExecutor = new ChainExecutor();
  
  // Create virtual agent adapter
  virtualAgentAdapter = new VirtualAgentAdapter(chainLoader, chainRegistry, chainExecutor);
  
  // Register chain commands
  registerChainCommands();
  
  // Register backward compatibility shim
  registerLegacyShim();
  
  console.log('[Chain-As-Agent] Initialization complete');
}

/**
 * Register /chain-name commands for all chains.
 * Each chain becomes a native command accessible as:
 *   /<chain-name> -- <prompt>
 */
function registerChainCommands(): void {
  if (!chainLoader || !chainRegistry || !chainExecutor) {
    console.warn('[Chain-As-Agent] Not initialized, cannot register commands');
    return;
  }
  
  const chains = chainRegistry.listChains();
  
  if (chains.length === 0) {
    console.log('[Chain-As-Agent] No chains available');
    return;
  }
  
  console.log(`[Chain-As-Agent] Registering ${chains.length} chain commands...`);
  
  for (const chain of chains) {
    registerChainCommand(chain);
  }
}

/**
 * Register single chain command.
 */
function registerChainCommand(chain: any): void {
  console.log(`[Chain-As-Agent] Registering command: /${chain.name} -- <prompt>`);
  
  // In real implementation, this would call pi.registerTool(...)
  // with the following structure:
  /*
    pi.registerTool(defineTool({
      name: chain.name,
      label: chain.displayName,
      description: chain.description,
      parameters: defineObject({
        prompt: { type: "string", description: "Prompt for chain" }
      }),
      run: async (params) => {
        const chainLoader = getChainLoader();
        const chainExecutor = getChainExecutor();
        const result = await chainExecutor.execute(
          chainLoader.load(chain.name),
          { cwd: process.cwd() },
          params.prompt
        );
        return result.aggregatedResult;
      }
    }));
  */
  
  // PLACEHOLDER - In real code, this calls pi.registerTool(...)
  // For now, just log
}

/**
 * Register backward compatibility shim.
 * Maintains both /run-chain and /chain-name for smooth migration.
 */
function registerLegacyShim(): void {
  console.log('[Chain-As-Agent] Registering backward compatibility shim (/run-chain)');
  
  // In real implementation:
  /*
    pi.registerTool(defineTool({
      name: 'run-chain',
      description: 'Execute a named chain (legacy shim)',
      parameters: defineObject({
        chainName: {
          type: 'string',
          description: 'Chain name to execute'
        },
        prompt: {
          type: 'string',
          description: 'Prompt to pass to chain'
        }
      }),
      run: async (params) => {
        console.warn('[Chain-As-Agent] /run-chain is deprecated, use /' + params.chainName);
        
        const chainName = params.chainName;
        const prompt = params.prompt;
        
        const chainLoader = getChainLoader();
        const chain = chainLoader.load(chainName);
        
        if (!chain) {
          return `Chain "${chainName}" not found. Available: ${getChainNames().join(', ')}`;
         }
        
        const chainExecutor = getChainExecutor();
        const result = await chainExecutor.execute(
          chain,
          { cwd: process.cwd() },
          prompt
        );
        
        return result.aggregatedResult;
      }
    }));
  */
}

/**
 * Get chain loader singleton.
 */
export function getChainLoader(): ChainLoader | null {
  return chainLoader;
}

/**
 * Get chain registry singleton.
 */
export function getChainRegistry(): ChainRegistry | null {
  return chainRegistry;
}

/**
 * Get chain executor singleton.
 */
export function getChainExecutor(): ChainExecutor | null {
  return chainExecutor;
}

/**
 * Get virtual agent adapter singleton.
 */
export function getVirtualAgentAdapter(): VirtualAgentAdapter | null {
  return virtualAgentAdapter;
}

/**
 * Execute chain directly (utility).
 * Useful for programmatic usage.
 */
export async function executeChain(
  chainName: string,
  prompt: string,
  context: any = { cwd: process.cwd() }
): Promise<any> {
  if (!chainLoader || !chainExecutor) {
    throw new Error('[Chain-As-Agent] Not initialized');
  }
  
  const chain = chainLoader.load(chainName);
  if (!chain) {
    throw new Error(`Chain "${chainName}" not found. Available: ${getChainNames().join(', ')}`);
  }
  
  const result = await chainExecutor.execute(chain, context, prompt);
  return result;
}

/**
 * Get all chain names.
 */
export function getChainNames(): string[] {
  if (!chainRegistry) {
    return [];
  }
  
  return chainRegistry.getChainNames();
}

/**
 * Get chain names for tool description.
 */
export function getToolDescription(): string {
  if (!chainRegistry) {
    return 'No chains available';
  }
  
  const chains = chainRegistry.listChains();
  if (chains.length === 0) {
    return 'No chains configured. Add chains to .pi/chains/*.yaml';
  }
  
  return chains.map(c => `- ${c.name}: ${c.displayName}`).join('\n');
}

/**
 * Initialize and start extension.
 * Call this at plugin load time.
 */
export async function initAndLaunch(): Promise<void> {
  initialize();
  console.log('[Chain-As-Agent] Extension launched');
}

export default { initAndLaunch, initialize, executeChain, getChainNames };
