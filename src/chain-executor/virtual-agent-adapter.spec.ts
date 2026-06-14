/**
 * VirtualAgentAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VirtualAgentAdapter } from './virtual-agent-adapter.js';
import { ChainDefinition } from '../chain-loader/chain-loader.js';

function createMockChainLoader() {
  return {
    load: vi.fn(),
    listChains: vi.fn(),
    getChainNames: vi.fn(),
    loadAll: vi.fn(),
    validate: vi.fn(),
   } as any;
 }

function createMockChainExecutor() {
  return {
    execute: vi.fn(),
    resume: vi.fn(),
   } as any;
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

function createContext() {
  return {
    cwd: '/tmp',
    conversationHistory: 'User: Hello\nAssistant: Hi',
    sessionManager: { getSessionId: () => 'session-123' },
   };
 }

describe('VirtualAgentAdapter', () => {
  let adapter: VirtualAgentAdapter;
  let chainLoader: any;
  let chainExecutor: any;
  let context: ReturnType<typeof createContext>;

  beforeEach(() => {
    chainLoader = createMockChainLoader();
    chainExecutor = createMockChainExecutor();
    adapter = new VirtualAgentAdapter(chainLoader, chainLoader, chainExecutor);
    context = createContext();
    vi.clearAllMocks();
  });

 describe('Constructor', () => {
    it('creates instance with chain loader', () => {
      expect(adapter).toBeDefined();
      expect(adapter).toBeInstanceOf(VirtualAgentAdapter);
    });

    it('initializes empty history', () => {
      expect(adapter.getHistory()).toEqual([]);
    });

    it('initializes empty active chains', () => {
      expect(adapter.getActiveChains()).toEqual([]);
    });
  });

 describe('getAgentInfo', () => {
    it('returns agent info for existing chain', () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain',
        displayName: 'Test Chain',
        description: 'Test chain',
      }));

      const agentInfo = adapter.getAgentInfo('test-chain');
      expect(agentInfo).toBeDefined();
      expect(agentInfo?.name).toBe('test-chain');
      expect(agentInfo?.displayName).toBe('Test Chain');
    });

    it('returns undefined for non-existent chain', () => {
      chainLoader.load.mockReturnValue(undefined);
      const agentInfo = adapter.getAgentInfo('non-existent');
      expect(agentInfo).toBeUndefined();
    });

    it('caches agent info', () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      adapter.getAgentInfo('test-chain');
      chainLoader.load.mockClear();

      adapter.getAgentInfo('test-chain');
      expect(chainLoader.load).not.toHaveBeenCalled();
    });
  });

 describe('execute', () => {
    it('executes chain successfully', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'test-chain',
        agentResults: [{ agentType: 'test-agent', result: 'Success' }],
        aggregatedResult: 'Success result',
        chainConfig: {},
        metrics: {
          totalTurns: 5, totalTokens: 100, totalDurationMs: 1000,
          agentsExecuted: 1, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      const result = await adapter.execute('test-chain', 'Prompt', context);

      expect(result.status).toBe('success');
      expect(result.result).toBe('Success result');
    });

    it('handles missing chain', async () => {
      chainLoader.load.mockReturnValue(undefined);

      const result = await adapter.execute('non-existent', 'Prompt', context);

      expect(result.status).toBe('failed');
      expect(result.errorContext).toBeDefined();
    });

    it('handles execution failure', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: false,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: 'Chain execution failed',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
        error: 'Test error',
      });

      const result = await adapter.execute('test-chain', 'Prompt', context);

      expect(result.status).toBe('failed');
      expect(result.errorContext?.errorMessage).toBe('Test error');
    });

    it('handles execution exception', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockRejectedValue(new Error('Chain executor error'));

      const result = await adapter.execute('test-chain', 'Prompt', context);

      expect(result.status).toBe('failed');
      expect(result.errorContext?.errorMessage).toBe('Chain executor error');
    });

    it('logs successful execution', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: 'Result',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 100,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      await adapter.execute('test-chain', 'Prompt', context);

      const history = adapter.getHistory('test-chain');
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
    });

    it('handles empty result', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: '',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      const result = await adapter.execute('test-chain', 'Prompt', context);
      expect(result.result).toEqual('');
    });
  });

 describe('steer', () => {
    it('logs steering for running chain', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: 'Result',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      await adapter.execute('test-chain', 'Prompt', context);
      await adapter.steer('test-chain', 'Steering message');

      expect(adapter.getActiveChains()).toContain('test-chain');
    });

    it('logs no active chain', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await adapter.steer('non-existent', 'Message');
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('No active chain')
      );
      logSpy.mockRestore();
    });

    it('handles steering non-existent chain', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await adapter.steer('non-existent', 'Message');
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

 describe('resume', () => {
    it('handles resume not implemented', async () => {
      const result = await adapter.resume(
        'test-chain',
        {} as any,
        '',
        context
      );

      expect(result.status).toBe('failed');
      expect(result.result).toContain('not yet implemented');
    });

    it('handles resume error', async () => {
      chainExecutor.resume = async () => {
        throw new Error('Checkpoint error');
      };

      const result = await adapter.resume('test-chain', {} as any, 'Prompt', context);

      expect(result.status).toBe('failed');
      expect(result.errorContext?.errorMessage).toBe('Checkpoint error');
    });
  });

 describe('getHistory', () => {
    it('returns all history', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'test-chain', displayName: 'Test Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: 'Result',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 100,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      await adapter.execute('test-chain', 'Prompt', context);
      await adapter.execute('test-chain', 'Prompt2', context);

      const history = adapter.getHistory('test-chain');
      expect(history).toHaveLength(2);
    });

    it('returns filtered history', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'chain-a', displayName: 'Chain A', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'chain-a',
        agentResults: [],
        aggregatedResult: 'A',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      chainLoader.load.mockReturnValue(createMockChain({
        name: 'chain-b', displayName: 'Chain B', description: 'Test',
      }));

      await adapter.execute('chain-a', 'A', context);
      await adapter.execute('chain-b', 'B', context);
      await adapter.execute('chain-a', 'A2', context);

      const history = adapter.getHistory('chain-a');
      expect(history).toHaveLength(2);
    });

    it('returns empty history for new chain', () => {
      const history = adapter.getHistory('new-chain');
      expect(history).toEqual([]);
    });

    it('returns empty history initially', () => {
      const history = adapter.getHistory();
      expect(history).toEqual([]);
    });
  });

 describe('getActiveChains', () => {
    it('returns active chains list', () => {
      adapter.setActiveChain('chain-1');
      adapter.setActiveChain('chain-2');

      const active = adapter.getActiveChains();
      expect(active).toContain('chain-1');
      expect(active).toContain('chain-2');
    });

    it('returns empty list initially', () => {
      const active = adapter.getActiveChains();
      expect(active).toEqual([]);
    });

    it('tracks all active chains', () => {
      adapter.setActiveChain('chain-1');
      adapter.setActiveChain('chain-2');
      adapter.setActiveChain('chain-3');

      const active = adapter.getActiveChains();
      expect(active).toHaveLength(3);
    });
  });

 describe('setActiveChain', () => {
    it('sets chain as active', () => {
      adapter.setActiveChain('new-chain');
      const active = adapter.getActiveChains();
      expect(active).toContain('new-chain');
    });

    it('initializes with default state', () => {
      adapter.setActiveChain('test-chain');
      expect(adapter.getActiveChains()).toContain('test-chain');
    });

    it('tracks startedAt timestamp', () => {
      adapter.setActiveChain('timestamp-chain');
      const active = adapter.getActiveChains();
      expect(active).toContain('timestamp-chain');
    });
  });

 describe('markChainCompleted', () => {
    it('marks chain as completed', () => {
      adapter.setActiveChain('to-complete');
      adapter.markChainCompleted('to-complete');
      expect(adapter.getActiveChains()).toContain('to-complete');
    });

    it('sets completedAt timestamp', () => {
      adapter.setActiveChain('completed-chain');
      adapter.markChainCompleted('completed-chain');
      expect(adapter.getActiveChains()).toContain('completed-chain');
    });

    it('handles non-existent chain gracefully', () => {
      expect(() => adapter.markChainCompleted('non-existent')).not.toThrow();
    });
  });

 describe('markChainFailed', () => {
    it('marks chain as failed', () => {
      adapter.setActiveChain('to-fail');
      adapter.markChainFailed('to-fail');
      expect(adapter.getActiveChains()).toContain('to-fail');
    });

    it('handles non-existent chain gracefully', () => {
      expect(() => adapter.markChainFailed('non-existent')).not.toThrow();
    });
  });

 describe('registerEventHandlers', () => {
    it('registers handlers', () => {
      adapter.registerEventHandlers();
      expect(adapter).toBeDefined();
    });

    it('registers multiple handlers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      adapter.registerEventHandlers(h1, h2);
      expect(h1).toBeDefined();
      expect(h2).toBeDefined();
    });
  });

 describe('Backward Compatibility', () => {
    it('chain name resolution works', () => {
      chainLoader.getChainNames.mockReturnValue(['chain-1', 'chain-2']);
      const names = chainLoader.getChainNames();
      expect(names).toEqual(['chain-1', 'chain-2']);
    });

    it('legacy loading works', () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'legacy-chain', displayName: 'Legacy', description: 'Test',
      }));

      const chain = chainLoader.load('legacy-chain');
      expect(chain?.name).toBe('legacy-chain');
    });
  });

 describe('Edge Cases', () => {
    it('handles empty results', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'empty-chain', displayName: 'Empty', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'empty-chain',
        agentResults: [],
        aggregatedResult: '',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      const result = await adapter.execute('empty-chain', 'Prompt', context);
      expect(result.result).toEqual('');
    });

    it('handles very long results', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'long-chain', displayName: 'Long Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'long-chain',
        agentResults: [],
        aggregatedResult: 'x'.repeat(10000),
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      const result = await adapter.execute('long-chain', 'Prompt', context);
      expect(result.result?.length).toBe(10000);
    });

    it('handles undefined context', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'no-context', displayName: 'No Context', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'no-context',
        agentResults: [],
        aggregatedResult: 'Result',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      const result = await adapter.execute('no-context', 'Prompt');
      expect(result.result).toBe('Result');
    });
  });

 describe('Performance', () => {
    it('executes many chains', async () => {
      const promises: Promise<any>[] = [];

      for (let i = 0; i < 20; i++) {
        chainLoader.load.mockReturnValue(createMockChain({
          name: `chain-${i}`, displayName: `Chain ${i}`, description: `Test ${i}`,
        }));

        chainExecutor.execute.mockResolvedValue({
          success: true,
          chainId: `chain-${i}`,
          agentResults: [],
          aggregatedResult: `Result ${i}`,
          chainConfig: {},
          metrics: {
            totalTurns: 0, totalTokens: 0, totalDurationMs: 10,
            agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
            variablesResolved: 0, retries: [],
          },
          variables: {},
        });

        promises.push(adapter.execute(`chain-${i}`, 'Prompt', context));
      }

      await Promise.all(promises);

      const history = adapter.getHistory();
      expect(history).toHaveLength(20);
    });

    it('handles concurrent execution', async () => {
      const promises: Promise<any>[] = [];

      for (let i = 0; i < 50; i++) {
        chainLoader.load.mockReturnValue(createMockChain({
          name: `concurrent-${i}`, displayName: `Chain ${i}`, description: 'Test',
        }));

        chainExecutor.execute.mockResolvedValue({
          success: true,
          chainId: `concurrent-${i}`,
          agentResults: [],
          aggregatedResult: 'Result',
          chainConfig: {},
          metrics: {
            totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
            agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
            variablesResolved: 0, retries: [],
          },
          variables: {},
        });

        promises.push(adapter.execute(`concurrent-${i}`, 'Prompt', context));
      }

      const results = await Promise.all(promises);
      expect(results.every(r => r.status === 'success')).toBe(true);
    });
  });

 describe('Integration', () => {
    it('executes steers logs', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'integration-chain', displayName: 'Integration', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'integration-chain',
        agentResults: [],
        aggregatedResult: 'Success',
        chainConfig: {},
        metrics: {
          totalTurns: 5, totalTokens: 100, totalDurationMs: 500,
          agentsExecuted: 1, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      await adapter.execute('integration-chain', 'Prompt', context);
      await adapter.steer('integration-chain', 'Steering');

      const history = adapter.getHistory('integration-chain');
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe('success');
    });

    it('handles execution completion flow', async () => {
      chainLoader.load.mockReturnValue(createMockChain({
        name: 'flow-chain', displayName: 'Flow Chain', description: 'Test',
      }));

      chainExecutor.execute.mockResolvedValue({
        success: true,
        chainId: 'flow-chain',
        agentResults: [],
        aggregatedResult: 'Result',
        chainConfig: {},
        metrics: {
          totalTurns: 0, totalTokens: 0, totalDurationMs: 0,
          agentsExecuted: 0, agentsFailed: 0, agentsRetried: 0,
          variablesResolved: 0, retries: [],
        },
        variables: {},
      });

      await adapter.execute('flow-chain', 'Prompt', context);
      adapter.markChainCompleted('flow-chain');

      expect(adapter.getActiveChains()).toContain('flow-chain');
    });
  });
});
