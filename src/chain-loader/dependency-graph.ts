/**
 * Agent Dependency Graph - Detect circular dependencies in chain graphs
 * 
 * This module provides cycle detection for chain agent dependencies using
 * three-color DFS coloring (white/gray/black). All cycles are detected
 * at chain load time, not execution time.
 */

// ---- Graph Types ----

/** Node identifier in the graph. */
export type NodeId = string;

/** Edge representing a dependency. */
export interface Edge {
  from: NodeId;
  to: NodeId;
}

/** Directed graph with nodes and edges. */
export class Graph<T = NodeId> {
  private adjacencyList: Map<T, Set<NodeId>> = new Map();
  
  /** Add a node. */
  addNode(node: T): void {
    if (!this.adjacencyList.has(node)) {
      this.adjacencyList.set(node, new Set());
    }
   }
  
  /** Add edge from -> to. */
  addEdge(from: T, to: T): void {
    this.addNode(from);
    this.addNode(to);
    
    const fromSet = this.adjacencyList.get(from);
    if (fromSet) {
      fromSet.add(to);
    }
   }
  
  /** Get all nodes. */
  nodes(): Set<T> {
    return new Set(this.adjacencyList.keys());
   }
  
  /** Get neighbors of a node. */
  getNeighbors(node: T): Set<NodeId> {
    return this.adjacencyList.get(node) ?? new Set();
   }
  
  /** Check if graph is empty. */
  isEmpty(): boolean {
    return this.adjacencyList.size === 0;
   }
  
  /** Get number of nodes. */
  size(): number {
    return this.adjacencyList.size;
   }
}

/** Color for DFS node coloring. */
enum Color {
  WHITE = 0,     // Not yet visited
  GRAY = 1,      // Currently being processed
  BLACK = 2      // Fully processed
}

/** Cycle information. */
export interface CycleInfo {
  cycle: string[];           // Node path representing the cycle
  severity: 'error';           // Always blocking
  message: string;            // Human-readable error
}

/**
 * AgentDependencyGraph - Three-color DFS cycle detection
 * 
 * Implements Tarjan's algorithm variant for detecting cycles in directed graphs.
 * Uses three-color DFS: white (unvisited), gray (in-progress), black (complete).
 * 
 * When a gray node is discovered, a cycle exists.
 */
export class ChainAgentDependencyGraph {
  /** Cached graph. */
  private graph?: Graph<NodeId>;

  /**
    * Build a dependency graph from chain agents.
    */
  buildGraph(chainAgentTypes: string[]): Graph<NodeId> {
    const graph = new Graph<NodeId>();
    
    for (const agentType of chainAgentTypes) {
      graph.addNode(agentType);
    }
    
    this.graph = graph;
    return graph;
   }
  
  /**
    * Detect cycles in the graph using three-color DFS.
    */
  detectCycles(graph: Graph<NodeId>): CycleInfo[] {
    const cycles: CycleInfo[] = [];
    const colorMap = new Map<NodeId, Color>();
    const parentMap = new Map<NodeId, NodeId | null>();
    const visited = new Set<NodeId>();
    
    // Initialize all nodes as white
    for (const node of graph.nodes()) {
      colorMap.set(node, Color.WHITE);
     }
    
    /** DFS traversal to detect cycles */
    function dfs(node: NodeId, path: NodeId[]): void {
      if (colorMap.get(node) === Color.GRAY) {
        // Cycle detected! Build cycle path from gray node to current
        const cycleStart = path.indexOf(node);
        const cyclePath = path.slice(cycleStart);
        
        cycles.push({
          cycle: cyclePath,
          severity: 'error',
          message: `Circular dependency detected: ${cyclePath.join(' → ')}`
         });
        return;
       }
      
      if (colorMap.get(node) === Color.BLACK) {
        return; // Already fully processed
       }
      
       // Mark as gray (in-progress)
      colorMap.set(node, Color.GRAY);
      path.push(node);
      parentMap.set(node, path[path.length - 2] ?? null);
      
       // Visit neighbors
      for (const neighbor of graph.getNeighbors(node)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          dfs(neighbor, path);
         }
       }
      
       // Mark as black (done)
      colorMap.set(node, Color.BLACK);
      path.pop();
     }
    
     // Run DFS from each unvisited node
    for (const node of graph.nodes()) {
      if (!visited.has(node)) {
        visited.add(node);
        dfs(node, []);
       }
     }
    
    return cycles;
   }
  
  /**
    * Topological sort of the graph (if acyclic).
    */
  topologicalSort(graph: Graph<NodeId>): NodeId[] {
    const cycles = this.detectCycles(graph);
    if (cycles.length > 0) {
      throw new Error(`Cannot topologically sort: ${cycles[0].message}`);
     }
    
    const result: NodeId[] = [];
    const inDegree = new Map<NodeId, number>();
    
     // Calculate in-degrees
    for (const node of graph.nodes()) {
      inDegree.set(node, 0);
     }
    
    for (const node of graph.nodes()) {
      for (const neighbor of graph.getNeighbors(node)) {
        const inDeg = inDegree.get(neighbor);
        if (inDeg !== undefined) {
          inDegree.set(neighbor, inDeg + 1);
         }
       }
     }
    
     // Process nodes with in-degree 0
    const queue: NodeId[] = [];
    for (const node of graph.nodes()) {
      if (inDegree.get(node) === 0) {
        queue.push(node);
       }
     }
    
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      
      for (const neighbor of graph.getNeighbors(node)) {
        const inDeg = inDegree.get(neighbor);
        if (inDeg !== undefined) {
          inDegree.set(neighbor, inDeg - 1);
          if (inDeg - 1 === 0) {
            queue.push(neighbor);
           }
         }
       }
     }
    
    return result;
   }
  
  /**
    * Get dependencies for a specific node.
    */
  getDependencies(nodeId: NodeId): string[] {
    if (!this.graph) return [];
    
    const deps: string[] = [];
    const visited = new Set<NodeId>();
    
    function traverse(node: NodeId): void {
      if (visited.has(node)) return;
      visited.add(node);
      
      for (const neighbor of this.graph!.getNeighbors(node)) {
        deps.push(neighbor);
        traverse(neighbor);
       }
     }
    
    traverse(nodeId);
    return deps;
   }
  
  /**
    * Reset the graph.
    */
  reset(): void {
    this.graph = undefined;
   }
}
