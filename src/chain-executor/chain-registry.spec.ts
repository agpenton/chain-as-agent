/**
 * ChainRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainRegistry } from './chain-registry.js';
import { ChainDefinition } from '../chain-loader/chain-loader.js';

function createMockChainLoader() {
  const mockLoader = {
    getChainNames: vi.fn(),
    listChains: vi.fn(),
    load: vi.fn(),
    validate: vi.fn().mockReturnThis(),
  } as any;
  
  return mockLoader;
}

function createMockChain(params: Partial<ChainDefinition> = {}): ChainDefinition {
  return {
    name: params.name || 'test-chain',
    displayName: params.displayName || 'Test Chain',
    description: params.description || 'Test',
    version: params.version || '1.0',
    agents: params.agents || [],
    config: params.config,
  };
}

describe('ChainRegistry', () => {
  let registry: ChainRegistry;
  let chainLoader: any;

  beforeEach(() => {
    chainLoader = createMockChainLoader();
    registry = new ChainRegistry(chainLoader);
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('creates instance with chain loader', () => {
      expect(registry).toBeDefined();
      expect(registry).toBeInstanceOf(ChainRegistry);
    });

    it('initializes empty chains', () => {
      expect(registry.getChainCount()).toBe(0);
      expect(registry.listChains()).toEqual([]);
    });
  });

  describe('getChain', () => {
    it('returns chain by ID', () => {
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'my-chain' })]);
      
      const chain = registry.getChain('my-chain');
      expect(chain).toBeDefined();
      expect(chain?.name).toBe('my-chain');
    });

    it('returns undefined for non-existent chain', () => {
      const chain = registry.getChain('non-existent');
      expect(chain).toBeUndefined();
    });
   });

  describe('listChains', () => {
    it('returns all chains', () => {
      chainLoader.listChains.mockReturnValue([
         createMockChain({ name: 'chain-1' }),
         createMockChain({ name: 'chain-2' }),
         createMockChain({ name: 'chain-3' }),
       ]);
      
      const chains = registry.listChains();
      expect(chains).toHaveLength(3);
     });

    it('returns empty array when no chains', () => {
      chainLoader.listChains.mockReturnValue([]);
      const chains = registry.listChains();
      expect(chains).toEqual([]);
    });
  });

  describe('getChainNames', () => {
    it('returns chain IDs', () => {
      chainLoader.listChains.mockReturnValue([
         createMockChain({ name: 'chain-a' }),
         createMockChain({ name: 'chain-b' }),
       ]);
      
      const names = registry.getChainNames();
      expect(names).toEqual(['chain-a', 'chain-b']);
     });

    it('returns empty array when no chains', () => {
      chainLoader.listChains.mockReturnValue([]);
      const names = registry.getChainNames();
      expect(names).toEqual([]);
      });
  });

  describe('refresh', () => {
    it('refreshes chains from disk', async () => {
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'new-chain' })]);
      
      await registry.refresh();
      
      const chains = registry.listChains();
      expect(chains).toHaveLength(1);
     });

    it('emits chain_loaded event', async () => {
      const eventSpy = vi.fn();
      registry.subscribe(eventSpy);
      
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'test-chain' })]);
      
      await registry.refresh();
      
      expect(eventSpy).toHaveBeenCalled();
     });

    it('clears existing chains', async () => {
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'first' })]);
      
      await registry.refresh();
      
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'second' })]);
      
      await registry.refresh();
      
      expect(registry.listChains()).toHaveLength(1);
    });
  });

  describe('subscribe', () => {
    it('registers subscriber', async () => {
      const callback = vi.fn();
      const unsubscribe = registry.subscribe(callback);
      
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'test' })]);
      
      await registry.refresh();
      
      expect(callback).toHaveBeenCalled();
    });

    it('calls all subscribers', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      
      registry.subscribe(cb1);
      registry.subscribe(cb2);
      
      chainLoader.loadAll.mockResolvedValue([createMockChain({ name: 'test' })]);
      
      await registry.refresh();
      
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      });
  });

  describe('validateAll', () => {
    it('returns valid chains', () => {
      chainLoader.validate.mockReturnValue({ valid: true, errors: [], warnings: [] });
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'valid-chain' })]);
      
      const result = registry.validateAll();
      
      expect(result.valid.length).toBe(1);
      expect(result.invalid).toHaveLength(0);
       });

    it('returns invalid chains', () => {
      chainLoader.validate.mockReturnThis();
      chainLoader.listChains.mockReturnValue([]);
      
      const result = registry.validateAll();
      
      expect(result.invalid).toBeDefined();
       })
  });

  describe('getChainsForAgent', () => {
    it('returns chains for agent type', () => {
      chainLoader.listChains.mockReturnValue([
         createMockChain({ agents: [{ agent_type: 'target-agent', prompt: 'Test' }] }),
         createMockChain({ agents: [{ agent_type: 'other-agent', prompt: 'Test' }] }),
        ]);
      
      const chains = registry.getChainsForAgent('target-agent');
      
      expect(chains).toHaveLength(1);
      expect(chains[0].agents[0].agent_type).toBe('target-agent');
      });
  });

  describe('hasChain', () => {
    it('returns true for existing chain', () => {
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'test-chain' })]);
      
      expect(registry.hasChain('test-chain')).toBe(true);
       });

    it('returns false for non-existent chain', () => {
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'test-chain' })]);
      
      expect(registry.hasChain('non-existent')).toBe(false);
       });
  });

  describe('getChainCount', () => {
    it('returns correct count', () => {
      chainLoader.listChains.mockReturnValue([
         createMockChain({ name: 'chain-1' }),
         createMockChain({ name: 'chain-2' }),
         createMockChain({ name: 'chain-3' }),
        ]);
      
      expect(registry.getChainCount()).toBe(3);
       });
  
    it('returns zero when empty', () => {
      chainLoader.listChains.mockReturnValue([]);
      expect(registry.getChainCount()).toBe(0);
       })
  });

  describe('getChainSourcePath', () => {
    it('returns path for valid chain', () => {
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'test-chain' })]);
      
      const path = registry.getChainSourcePath('test-chain');
      expect(path).toBeDefined();
       })
   
    it('returns undefined for non-existent chain', () => {
      chainLoader.listChains.mockReturnValue([createMockChain({ name: 'test-chain' })]);
      
      const path = registry.getChainSourcePath('non-existent');
      expect(path).toBeUndefined();
       });
  });
  
  describe('Integration', () => {
    it('combines multiple registry methods', () => {
      chainLoader.listChains.mockReturnValue([
         createMockChain({ name: 'chain-1' }),
         createMockChain({ name: 'chain-2' }),
        ]);
      
      const chains = registry.listChains();
      expect(chains.length).toBe(2);
      expect(registry.getChainCount()).toBe(2);
    });
  });
});
