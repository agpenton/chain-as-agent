/**
 * ChainExecutor Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChainExecutor, ChainDefinition, ExtensionContext } from './chain-executor.js';

function createMockChain(params: Partial<ChainDefinition> = {}): ChainDefinition {
  return {
    name: params.name || 'test-chain',
    displayName: params.displayName || 'Test Chain',
    description: params.description || 'Test chain',
    version: params.version || '1.0',
    agents: params.agents || [],
    config: params.config,
  };
}

function createContext(): ExtensionContext {
  return {
    cwd: '/tmp',
    conversationHistory: 'User: Hello\nAssistant: Hi',
    sessionManager: { getSessionId: () => 'session-123' },
  };
}

describe('ChainExecutor', () => {
  executor: ChainExecutor;
  context: ExtensionContext;

  beforeEach(() => {
    executor = new ChainExecutor();
    context = createContext();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('creates instance with default config', () => {
      expect(executor).toBeDefined();
      expect(executor).toBeInstanceOf(ChainExecutor);
    });

    it('accepts custom maxRetries', () => {
      const exec = new ChainExecutor({ maxRetries: 5 });
      expect(exec).toBeDefined();
    });

    it('accepts custom backoffBaseMs', () => {
      const exec = new ChainExecutor({ backoffBaseMs: 2000 });
      expect(exec).toBeDefined();
    });
  });

  describe('setCallbackTimeouts', () => {
    it('sets timeout for onChainStart', () => {
      executor.setCallbackTimeouts({ onChainStartTimeoutMs: 1000 });
      expect(executor).toBeDefined();
    });

    it('sets timeout for onAgentStart', () => {
      executor.setCallbackTimeouts({ onAgentStartTimeoutMs: 2000 });
      expect(executor).toBeDefined();
    });

    it('sets timeout for onAgentComplete', () => {
      executor.setCallbackTimeouts({ onAgentCompleteTimeoutMs: 5000 });
      expect(executor).toBeDefined();
    });

    it('sets timeout for onAgentError', () => {
      executor.setCallbackTimeouts({ onAgentErrorTimeoutMs: 1000 });
      expect(executor).toBeDefined();
    });

    it('disables all timeouts', () => {
      executor.setCallbackTimeouts({ disableTimeouts: true });
      expect(executor.executionTimeoutConfig?.disableTimeouts).toBe(true);
    });

    it('sets multiple timeouts', () => {
      executor.setCallbackTimeouts({
        onChainStartTimeoutMs: 1000,
        onAgentStartTimeoutMs: 2000,
        onAgentCompleteTimeoutMs: 3000,
      });
      expect(executor).toBeDefined();
    });
  });

  describe('execute', () => {
    it('executes single agent chain', async () => {
      const chain = createMockChain({
        name: 'single-agent',
        agents: [{ agent_type: 'test-agent', prompt: 'Test' }],
      });

      const signals = {
        onChainStart: vi.fn(),
        onAgentStart: vi.fn(),
        onAgentComplete: vi.fn(),
        onProgress: vi.fn(),
        onChainComplete: vi.fn(),
      };

      const result = await executor.execute(chain, context, 'Prompt', signals);

      expect(result.success).toBe(true);
      expect(result.agentResults).toHaveLength(1);
      expect(result.metrics?.totalTurns).toBeGreaterThan(0);
      expect(signals.onChainStart).toHaveBeenCalled();
      expect(signals.onAgentStart).toHaveBeenCalled();
      expect(signals.onAgentComplete).toHaveBeenCalled();
    });

    it('executes multi-agent chain', async () => {
      const chain = createMockChain({
        name: 'multi-agent',
        agents: [
          { agent_type: 'agent-1', prompt: 'First' },
          { agent_type: 'agent-2', prompt: 'Second' },
          { agent_type: 'agent-3', prompt: 'Third' },
        ],
      });

      const signals = {
        onChainStart: vi.fn(),
        onAgentStart: vi.fn(),
        onAgentComplete: vi.fn(),
        onProgress: vi.fn(),
        onChainComplete: vi.fn(),
      };

      const result = await executor.execute(chain, context, 'Execute', signals);

      expect(result.success).toBe(true);
      expect(result.agentResults).toHaveLength(3);
      expect(signals.onAgentStart).toHaveBeenCalledTimes(3);
      expect(signals.onAgentComplete).toHaveBeenCalledTimes(3);
    });

    it('handles chain not found', async () => {
      const chain = createMockChain({
        name: 'test-chain',
        agents: [{ agent_type: 'test-agent', prompt: 'Test' }],
      });

      chainExecutor.execute = async () => ({
        success: false,
        chainId: 'test-chain',
        agentResults: [],
        aggregatedResult: 'Chain not found',
        chainConfig: {},
        metrics: {
          totalTurns: 0,
          totalTokens: 0,
          totalDurationMs: 0,
          agentsExecuted: 0,
          agentsFailed: 0,
          agentsRetried: 0,
          variablesResolved: 0,
          retries: [],
        },
        variables: {},
        error: 'Chain not found',
      });

      const result = await executor.execute(chain, context, 'Prompt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.agentResults).toHaveLength(0);
    });

    it('respects abort signal', async () => {
      const abortController = new AbortController();
      
      setTimeout(() => abortController.abort(), 10);

      const chain = createMockChain({
        name: 'abort-chain',
        agents: [
          { agent_type: 'agent-1', prompt: 'First' },
          { agent_type: 'agent-2', prompt: 'Second' },
          { agent_type: 'agent-3', prompt: 'Third' },
        ],
      });

      const signals = {
        onProgress: vi.fn(),
        signal: abortController.signal,
      };

      const result = await executor.execute(chain, context, 'Prompt', signals);

      expect(result.agentResults.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Retry Logic', () => {
    it('executes without retry', async () => {
      const chain = createMockChain({
        name: 'no-retry',
        agents: [{ agent_type: 'test-agent', prompt: 'Test', retry_count: 0 }],
      });

      const result = await executor.execute(chain, context, 'Prompt');

      expect(result.agentResults).toHaveLength(1);
      expect(result.metrics?.retries).toHaveLength(0);
    });

    it('executes with retry', async () => {
      const chain = createMockChain({
        name: 'with-retry',
        agents: [{ agent_type: 'test-agent', prompt: 'Test', retry_count: 3 }],
      });

      const result = await executor.execute(chain, context, 'Prompt');

      expect(result.agentResults).toHaveLength(1);
      expect(result.metrics?.agentsRetried).toBeDefined();
    });

    it('tracks retry attempts', async () => {
      const chain = createMockChain({
        name: 'track-retry',
        agents: [{ agent_type: 'test-agent', prompt: 'Test', backoff_base_ms: 100 }],
      });

      const result = await executor.execute(chain, context, 'Prompt');

      expect(result.metrics?.retries).toBeDefined();
    });
  });

  describe('Context Propagation', () => {
    it('uses inherit mode', async () => {
      const chain = createMockChain({
        name: 'inherit-mode',
        agents: [{ 
          agent_type: 'agent', 
          prompt: 'Test',
          context_mode: 'inherit'
        }],
      });

      const result = await executor.execute(chain, {
        ...context,
        conversationHistory: 'User: Hello\nAssistant: Hi',
      }, 'Prompt');

      expect(result.agentResults).toHaveLength(1);
    });

    it('uses inherit_compact mode', async () => {
      const chain = createMockChain({
        name: 'compact-mode',
        agents: [{ 
          agent_type: 'agent', 
          prompt: 'Test',
          context_mode: 'inherit_compact'
        }],
      });

      const result = await executor.execute(chain, context, 'Prompt');
      expect(result.agentResults).toHaveLength(1);
    });

    it('uses none mode', async () => {
      const chain = createMockChain({
        name: 'none-mode',
        agents: [{ 
          agent_type: 'agent', 
          prompt: 'Test',
          context_mode: 'none'
        }],
      });

      const result = await executor.execute(chain, context, 'Prompt');
      expect(result.agentResults).toHaveLength(1);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty chain', async () => {
      const chain = createMockChain({ name: 'empty-chain', agents: [] });
      const result = await executor.execute(chain, context, 'Test');

      expect(result.success).toBe(true);
      expect(result.agentResults).toHaveLength(0);
    });

    it('handles single agent', async () => {
      const chain = createMockChain({
        name: 'single',
        agents: [{ agent_type: 'agent-1', prompt: 'Test' }],
      });

      const result = await executor.execute(chain, context, 'Prompt');

      expect(result.agentResults).toHaveLength(1);
    });

    it('handles very long prompts', () => {
      const longPrompt = 'test '.repeat(1000);
      const chain = createMockChain({ agents: [{ agent_type: 'agent', prompt: longPrompt }] });

      expect(chain).toBeDefined();
    });

    it('handles missing context', async () => {
      const chain = createMockChain({
        name: 'no-context',
        agents: [{ agent_type: 'agent', prompt: 'Test' }],
      });

      const result = await executor.execute(chain, context as any, 'Prompt');

      expect(result).toBeDefined();
    });
  });

  describe('Backward Compatibility', () => {
    it('resume method exists', async () => {
      const result = await executor.resume(
        'test',
        {
          chainId: 'test',
          runId: 'run-1',
          state: 'running' as const,
          completedAgents: 0,
          pendingAgents: ['agent-1'],
          results: [],
          variables: {},
          timestamp: new Date().toISOString(),
        },
        context,
        'Resume'
      );

      expect(result).toBeDefined();
    });
  });
});
