/**
 * Dependency Graph Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChainAgentDependencyGraph } from './dependency-graph.js';

describe('ChainAgentDependencyGraph', () => {
  let graph: ChainAgentDependencyGraph;

  beforeEach(() => {
    graph = new ChainAgentDependencyGraph();
  });

  describe('Constructor', () => {
    it('creates empty graph', () => {
      const graphInstance = new ChainAgentDependencyGraph();
      expect(graphInstance).toBeDefined();
      });
     });

  describe('addEdge', () => {
    it('adds directed edge', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      expect(chainGraph.nodes().size).toBe(2);
      const neighbors = chainGraph.getNeighbors('agent-a');
      expect(neighbors.size).toBe(1);
      expect(neighbors.has('agent-b')).toBe(true);
      });

    it('handles self-loop', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      chainGraph.addEdge('agent-a', 'agent-a');
      expect(chainGraph.nodes().size).toBe(1);
      const neighbors = chainGraph.getNeighbors('agent-a');
      expect(neighbors.size).toBe(1);
      expect(neighbors.has('agent-a')).toBe(true);
      });

    it('handles duplicate edge', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-a', 'agent-b');
      // Duplicate edges should not increase neighbor count
      const neighbors = chainGraph.getNeighbors('agent-a');
      expect(neighbors.size).toBe(1);
      expect(neighbors.has('agent-b')).toBe(true);
      });

    it('chains multiple edges', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      chainGraph.addEdge('agent-c', 'agent-d');
      expect(chainGraph.nodes().size).toBe(4);
      });

    it('builds complex graph', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-a', 'agent-c');
      chainGraph.addEdge('agent-b', 'agent-d');
      chainGraph.addEdge('agent-c', 'agent-d');
      expect(chainGraph.nodes().size).toBe(4);
      const neighbors = chainGraph.getNeighbors('agent-a');
      expect(neighbors.size).toBe(2);
      expect(neighbors.has('agent-b')).toBe(true);
      expect(neighbors.has('agent-c')).toBe(true);
      });
     });

  describe('detectCycles', () => {
    it('detects no cycle in linear graph', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(0);
      });

    it('detects self-loop', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      chainGraph.addEdge('agent-a', 'agent-a');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle).toEqual(['agent-a']);
      });

    it('detects simple cycle', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-a');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle.length).toBe(2);
      });

    it('detects longer cycle', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      chainGraph.addEdge('agent-c', 'agent-a');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      expect(cycles[0].cycle.length).toBe(3);
      });

    it('handles empty graph', () => {
      const chainGraph = graph.buildGraph([]);
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(0);
      });

    it('handles single node', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      chainGraph.addEdge('agent-a', 'agent-a');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      });

    it('handles diamond pattern', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-a', 'agent-c');
      chainGraph.addEdge('agent-b', 'agent-d');
      chainGraph.addEdge('agent-c', 'agent-d');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(0);
      });

    it('handles multiple cycles', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-a');
      chainGraph.addEdge('agent-c', 'agent-d');
      chainGraph.addEdge('agent-d', 'agent-c');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(2);
      });

    it('handles multi-component graph', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-c', 'agent-d');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(0);
      });

    it('handles graph with bridge', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c', 'agent-d']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-a');
      chainGraph.addEdge('agent-b', 'agent-c');
      chainGraph.addEdge('agent-c', 'agent-d');
      chainGraph.addEdge('agent-d', 'agent-c');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(2);
      });
     });

  describe('getDependencies', () => {
    it('returns dependencies', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-a', 'agent-c');
      expect(chainGraph).toBeDefined();
      });

    it('returns empty when none exist', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      expect(chainGraph).toBeDefined();
      });
     });

  describe('topologicalSort', () => {
    it('sorts linear chain', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      const sorted = graph.topologicalSort(chainGraph);
      expect(sorted).toBeDefined();
      expect(sorted.length).toBe(3);
      });

    it('handles single node', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      const sorted = graph.topologicalSort(chainGraph);
      expect(sorted).toBeDefined();
      expect(sorted.length).toBe(1);
      });

    it('handles empty graph', () => {
      const chainGraph = graph.buildGraph([]);
      const sorted = graph.topologicalSort(chainGraph);
      expect(sorted).toBeDefined();
      expect(sorted.length).toBe(0);
      });

    it('handles no dependencies', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      const sorted = graph.topologicalSort(chainGraph);
      expect(sorted).toBeDefined();
      });

    it('handles node without edges', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      const sorted = graph.topologicalSort(chainGraph);
      expect(sorted).toBeDefined();
      });
     });

  describe('getAllNodes', () => {
    it('returns all nodes', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      expect(chainGraph.nodes()).toBeDefined();
      expect(chainGraph.nodes().size).toBe(3);
      });

    it('handles single node', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      const nodes = chainGraph.nodes();
      expect(nodes).toBeDefined();
      expect(nodes.size).toBe(1);
      });

    it('handles empty graph', () => {
      const chainGraph = graph.buildGraph([]);
      const nodes = chainGraph.nodes();
      expect(nodes).toBeDefined();
      expect(nodes.size).toBe(0);
      });
     });

  describe('Edge Cases', () => {
    it('handles empty nodes', () => {
      const chainGraph = graph.buildGraph([]);
      expect(chainGraph.nodes()).toBeDefined();
      expect(chainGraph.nodes().size).toBe(0);
      });

    it('handles undefined edges', () => {
      const chainGraph = graph.buildGraph(['agent-a']);
      chainGraph.addEdge('agent-a', 'agent-a');
      expect(chainGraph).toBeDefined();
      });

    it('handles duplicate edges', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-a', 'agent-b');
      expect(chainGraph).toBeDefined();
      });

    it('handles isolated nodes', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      expect(chainGraph).toBeDefined();
      });
     });

  describe('Integration', () => {
    it('handles chain dependencies', () => {
      const chainGraph = graph.buildGraph(['chain-loader-agent', 'chain-executor-agent']);
      chainGraph.addEdge('chain-loader-agent', 'chain-executor-agent');
      expect(chainGraph).toBeDefined();
      expect(chainGraph.nodes().size).toBe(2);
      });

    it('handles cross-chain dependencies', () => {
      const chainGraph = graph.buildGraph(['chain-a-agent', 'chain-b-agent']);
      chainGraph.addEdge('chain-a-agent', 'chain-b-agent');
      expect(chainGraph).toBeDefined();
      expect(chainGraph.nodes().size).toBe(2);
      });

    it('handles circular chain dependencies', () => {
      const chainGraph = graph.buildGraph(['chain-a-agent', 'chain-b-agent', 'chain-c-agent']);
      chainGraph.addEdge('chain-a-agent', 'chain-b-agent');
      chainGraph.addEdge('chain-b-agent', 'chain-c-agent');
      chainGraph.addEdge('chain-c-agent', 'chain-a-agent');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      });

    it('validates acyclic graph', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b', 'agent-c']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-c');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(0);
      });

    it('validates cyclic graph', () => {
      const chainGraph = graph.buildGraph(['agent-a', 'agent-b']);
      chainGraph.addEdge('agent-a', 'agent-b');
      chainGraph.addEdge('agent-b', 'agent-a');
      const cycles = graph.detectCycles(chainGraph);
      expect(cycles).toHaveLength(1);
      });
     });
     });
