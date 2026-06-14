/**
 * Unit Tests for ChainLoader
 * Coverage: Chain discovery, validation, loading, variable resolution
 */

import { describe, it, expect, beforeEach, afterEach, vi, MockInstance } from 'vitest';
import { ChainLoader, ChainDefinition, ChainAgent, VariableContext } from './chain-loader.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock fs module globally
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock parseYaml
vi.mock('@earendil-works/pi-coding-agent', () => ({
  parseYaml: vi.fn(),
}));

describe('ChainLoader', () => {
  let chainLoader: ChainLoader;
  let mockFsExistsSync: MockInstance;
  let mockFsReaddirSync: MockInstance;
  let mockFsReadFileSync: MockInstance;
  let mockParseYaml: MockInstance;

  beforeEach(() => {
    chainLoader = new ChainLoader();
    mockFsExistsSync = vi.mocked(fs.existsSync);
    mockFsReaddirSync = vi.mocked(fs.readdirSync);
    mockFsReadFileSync = vi.mocked(fs.readFileSync);
    mockParseYaml = vi.mocked<any>((await import('@earendil-works/pi-coding-agent')).parseYaml);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('creates instance with default chains directory', () => {
      const loader = new ChainLoader();
      expect(loader).toBeDefined();
    });

    it('creates instance with custom chains directory', () => {
      const loader = new ChainLoader('./custom/chains');
      expect(loader).toBeDefined();
    });

    it('creates instance with allowChainFilesInAgents disabled', () => {
      const loader = new ChainLoader('.pi/chains', false);
      expect(loader).toBeDefined();
    });
  });

  describe('listChains', () => {
    it('returns empty array when no chains loaded', () => {
      const chains = chainLoader.listChains();
      expect(chains).toEqual([]);
    });

    it('returns correct number of chains after load', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['chain1.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'test-chain',
        displayName: 'Test Chain',
        description: 'A test chain',
        version: '1.0',
        agents: [{ agent_type: 'agent-1', prompt: 'Test prompt' }],
      });

      const chains = await chainLoader.loadAll();
      expect(chains).toHaveLength(1);
      
      const list = chainLoader.listChains();
      expect(list).toHaveLength(1);
    });
  });

  describe('getChainNames', () => {
    it('returns chain names for registered chains', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['my-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'my-chain',
        displayName: 'My Chain',
        description: 'Test',
        version: '1.0',
        agents: [{ agent_type: 'test-agent', prompt: 'Test' }],
      });

      await chainLoader.loadAll();
      
      const names = chainLoader.getChainNames();
      expect(names).toEqual(['my-chain']);
    });

    it('returns empty array when no chains exist', () => {
      const names = chainLoader.getChainNames();
      expect(names).toEqual([]);
    });
  });

  describe('load', () => {
    it('loads a specific chain by ID', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['test-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'test-chain',
        displayName: 'Test Chain',
        description: 'Test',
        version: '1.0',
        agents: [{ agent_type: 'test-agent', prompt: 'Test prompt' }],
      });

      await chainLoader.loadAll();
      
      const chain = chainLoader.load('test-chain');
      expect(chain).toBeDefined();
      expect(chain?.name).toBe('test-chain');
      expect(chain?.displayName).toBe('Test Chain');
    });

    it('returns undefined for non-existent chain', () => {
      const chain = chainLoader.load('non-existent');
      expect(chain).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('returns valid result for well-formed chain', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['valid-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'valid-chain',
        displayName: 'Valid Chain',
        description: 'A chain with valid structure',
        version: '1.0',
        agents: [
          { 
            agent_type: 'agent-1', 
            prompt: 'First prompt',
            timeout_ms: 60000
          },
          { 
            agent_type: 'agent-2', 
            prompt: 'Second prompt'
          },
        ],
      });

      await chainLoader.loadAll();
      
      const validation = chainLoader.validate('valid-chain');
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    });

    it('returns invalid result for missing agent_type', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['invalid.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'invalid',
        displayName: 'Invalid Chain',
        description: 'Missing agent type',
        version: '1.0',
        agents: [{ prompt: 'Missing agent_type' }],
      });

      await chainLoader.loadAll();
      
      const validation = chainLoader.validate('invalid');
      expect(validation.valid).toBe(false);
    });

    it('returns invalid result for exceeding max agents', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['big-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'big-chain',
        displayName: 'Big Chain',
        description: 'Too many agents',
        version: '1.0',
        agents: Array(51).fill(null).map((_, i) => ({
          agent_type: `agent-${i}`,
          prompt: `Prompt ${i}`,
        })),
      });

      await chainLoader.loadAll();
      
      const validation = chainLoader.validate('big-chain');
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(
        expect.stringContaining('exceeds maximum agent limit')
      );
    });

    it('returns invalid when chain not found', () => {
      const validation = chainLoader.validate('non-existent-chain');
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContainEqual(expect.stringContaining('not found'));
    });
  });

  describe('loadAll', () => {
    it('loads multiple chains from directory', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue([
        'chain1.yaml',
        'chain2.yaml',
        'chain3.yaml',
      ]);
      
      mockParseYaml.mockReturnValueOnce({
        name: 'chain1',
        displayName: 'Chain 1',
        description: 'First chain',
        version: '1.0',
        agents: [{ agent_type: 'agent-1', prompt: 'Prompt 1' }],
      }).mockReturnValueOnce({
        name: 'chain2',
        displayName: 'Chain 2',
        description: 'Second chain',
        version: '1.0',
        agents: [{ agent_type: 'agent-2', prompt: 'Prompt 2' }],
      }).mockReturnValueOnce({
        name: 'chain3',
        displayName: 'Chain 3',
        description: 'Third chain',
        version: '1.0',
        agents: [{ agent_type: 'agent-3', prompt: 'Prompt 3' }],
      });

      const chains = await chainLoader.loadAll();
      expect(chains).toHaveLength(3);
      expect(chains.map(c => c.name)).toEqual(['chain1', 'chain2', 'chain3']);
    });

    it('loads chains from .md files when enabled', async () => {
      mockFsExistsSync
        .mockReturnValueOnce(true) // chains dir
        .mockReturnValueOnce(true); // agents dir
      
      mockFsReaddirSync.mockReturnValue(['agent-chain.md']);
      mockParseYaml.mockReturnValue({
        name: 'agent-chain',
        displayName: 'Agent Chain',
        description: 'Chain from .md',
        version: '1.0',
        agents: [{ agent_type: 'agent-1', prompt: 'From markdown' }],
      });

      const chains = await chainLoader.loadAll();
      expect(chains).toHaveLength(1);
    });

    it('handles error when chains dir does not exist', async () => {
      mockFsExistsSync.mockReturnValue(false);
      mockFsReaddirSync.mockReturnValue([]);

      const chains = await chainLoader.loadAll();
      expect(chains).toEqual([]);
    });

    it('handles error when file load fails', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['bad-chain.yaml']);
      mockFsReadFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      const chains = await chainLoader.loadAll();
      expect(chains).toEqual([]);
    });

    it('handles malformed YAML gracefully', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['malformed.yaml']);
      mockParseYaml.mockReturnValue('not-an-object');

      const chains = await chainLoader.loadAll();
      expect(chains).toEqual([]);
    });
  });

  describe('reload', () => {
    it('clears and reloads all chains', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['existing-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'existing-chain',
        displayName: 'Existing Chain',
        description: 'To reload',
        version: '1.0',
        agents: [{ agent_type: 'test-agent', prompt: 'Test' }],
      });

      await chainLoader.loadAll();
      expect(chainLoader.listChains()).toHaveLength(1);

      mockFsReaddirSync.mockReturnValue(['new-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'new-chain',
        displayName: 'New Chain',
        description: 'After reload',
        version: '1.0',
        agents: [{ agent_type: 'new-agent', prompt: 'New' }],
      });

      await chainLoader.reload();
      expect(chainLoader.listChains()).toHaveLength(1);
      expect(chainLoader.listChains()[0].name).toBe('new-chain');
    });
  });

  describe('setOnChainLoad', () => {
    it('registers callback for chain loading', async () => {
      const onLoad = vi.fn();
      chainLoader = new ChainLoader();
      chainLoader.setOnChainLoad(onLoad);

      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['onload-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'onload-chain',
        displayName: 'OnLoad Chain',
        description: 'Triggers onLoad',
        version: '1.0',
        agents: [{ agent_type: 'test-agent', prompt: 'Test' }],
      });

      await chainLoader.loadAll();
      expect(onLoad).toHaveBeenCalledWith('onload-chain');
    });
  });

  describe('setOnChainError', () => {
    it('registers callback for chain errors', async () => {
      const onError = vi.fn();
      chainLoader = new ChainLoader();
      chainLoader.setOnChainError(onError);

      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['error-chain.yaml']);
      mockFsReadFileSync.mockImplementation(() => {
        throw new Error('Load error');
      });

      await chainLoader.loadAll();
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('resolveVariables', () => {
    it('resolves environment variables $VAR_NAME', () => {
      const context: VariableContext = {
        env: { MY_VAR: 'env-value', ANOTHER_VAR: 'another-value' },
      };
      
      const result = chainLoader.resolveVariables(
        'Value is $MY_VAR',
        context
      );
      
      expect(result).toContain('env-value');
      expect(result).not.toContain('$MY_VAR');
    });

    it('resolves config variables {{config:key}}', () => {
      const context: VariableContext = {
        chainConfig: {
          variables: { foo: 'bar', nested: { key: 'value' } },
        },
      };
      
      const result = chainLoader.resolveVariables(
        'Config value: {{config:foo}}',
        context
      );
      
      expect(result).toContain('bar');
    });

    it('resolves previous agent results {{agent_result:N}}', () => {
      const context: VariableContext = {
        previousResults: [
          { agentType: 'agent-1', result: 'First result', tokens: 100 },
          { agentType: 'agent-2', result: 'Second result', tokens: 200 },
        ],
      };
      
      const result = chainLoader.resolveVariables(
        'Result from agent 0: {{agent_result:0}}',
        context
      );
      
      expect(result).toContain('First result');
    });

    it('resolves file content {{file:path}}', () => {
      const context: VariableContext = {
        fileLoader: (path: string) => `Content of ${path}`,
      };
      
      const result = chainLoader.resolveVariables(
        'File content: {{file:./test.txt}}',
        context
      );
      
      expect(result).toContain('Content of ./test.txt');
    });

    it('handles undefined context safely', () => {
      const result = chainLoader.resolveVariables('Test $MISSING_VAR', {});
      expect(result).toBe('Test $MISSING_VAR');
    });
  });

  describe('registerVariableResolver', () => {
    it('registers custom variable resolver', () => {
      chainLoader.registerVariableResolver(
        /CUSTOM:([^]+)/,
        (match) => `resolved-${match[1]}`
      );
      
      const result = chainLoader.resolveVariables(
        'CUSTOM:test-resolver',
        {} as VariableContext
      );
      
      expect(result).toContain('resolved-test-resolver');
    });
  });

  describe('Chain Agent Dependency Graph Integration', () => {
    it('loads chains and validates graph', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['graph-chain.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'graph-chain',
        displayName: 'Graph Chain',
        description: 'Chain for graph testing',
        version: '1.0',
        agents: [
          { 
            agent_type: 'agent-A', 
            prompt: 'First',
            variables: { dep: '{{agent_result:0}}' }
          },
          { 
            agent_type: 'agent-B', 
            prompt: 'Second'
          },
        ],
      });

      await chainLoader.loadAll();
      const graphChain = chainLoader.load('graph-chain');
      expect(graphChain).toBeDefined();
      expect(graphChain?.agents).toHaveLength(2);
    });
  });

  describe('Variable Context Resolution', () => {
    it('handles complex variable templates', () => {
      const context: VariableContext = {
        env: { API_KEY: 'secret123' },
        chainConfig: {
          variables: { baseUrl: 'https://api.example.com' },
        },
        previousResults: [
          { agentType: 'fetch', result: '{\"status\":\"ok\"}', tokens: 50 },
        ],
      };
      
      const template = `
API_URL=$API_KEY
BASE={{config:baseUrl}}
NEXT_RESULT={{agent_result:0}}
`;
      
      const result = chainLoader.resolveVariables(template, context);
      expect(result).toContain('secret123');
      expect(result).toContain('https://api.example.com');
    });

    it('handles missing variables gracefully', () => {
      const context: VariableContext = {
        env: {},
      };
      
      const result = chainLoader.resolveVariables(
        '{{missing_var}} $UNDEFINED_VAR',
        context
      );
      expect(result).toBe('{{missing_var}} $UNDEFINED_VAR');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty chain', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['empty.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'empty-chain',
        displayName: 'Empty',
        description: '',
        version: '1.0',
        agents: [],
      });

      const chains = await chainLoader.loadAll();
      expect(chains).toHaveLength(1);
      
      const validation = chainLoader.validate('empty-chain');
      expect(validation.valid).toBe(true);
    });

    it('handles chain with missing required fields', async () => {
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(['missing.yaml']);
      mockParseYaml.mockReturnValue({
        name: 'missing',
        agents: [{ agent_type: 'test' }],
      });

      await chainLoader.loadAll();
      const chain = chainLoader.load('missing');
      expect(chain?.displayName).toBe('missing');
    });
  });

  describe('Performance Tests', () => {
    it('loads many chains efficiently', async () => {
      const chainCount = 20;
      const files = Array(chainCount).fill(null).map((_, i) => `chain-${i}.yaml`);
      
      mockFsExistsSync.mockReturnValue(true);
      mockFsReaddirSync.mockReturnValue(files);
      mockParseYaml.mockReturnThis();
      
      vi.mocked(mockParseYaml).mockImplementationOnce(() => ({
        name: 'dummy',
        displayName: 'Dummy',
        description: 'Dummy for perf test',
        version: '1.0',
        agents: [{ agent_type: 'dummy-agent', prompt: 'Test' }],
      }));

      const start = Date.now();
      await chainLoader.loadAll();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000);
    });
  });
});
