import type { Adventure } from '../types/adventure'
import { isTerminalNodeType } from '../types/adventure'
import type { ClassifierTags, NodeId } from './types'

// ---------------------------------------------------------------------------
// Internal graph-analysis helpers (pure, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Builds a lookup map from node id to node index in the adventure array.
 * Duplicate ids are not valid per the schema; the last occurrence wins, but
 * the validator will catch duplicates before the classifier is called.
 */
export function buildNodeMap(graph: Adventure): Map<NodeId, Adventure[number]> {
  const map = new Map<NodeId, Adventure[number]>()
  for (const node of graph) {
    map.set(node.id, node)
  }
  return map
}

/**
 * Computes the in-degree (number of incoming choice edges) for every node id
 * present in the graph.  Nodes with no incoming edges have an in-degree of 0.
 * Choice edges that reference an id not present in the graph are silently
 * ignored — the validator handles dangling `nextNode` references separately.
 */
export function buildInDegreeMap(
  graph: Adventure,
  nodeMap: Map<NodeId, Adventure[number]>,
): Map<NodeId, number> {
  const inDegree = new Map<NodeId, number>()
  for (const node of graph) {
    if (!inDegree.has(node.id)) inDegree.set(node.id, 0)
  }
  for (const node of graph) {
    for (const choice of node.choices) {
      if (nodeMap.has(choice.nextNode)) {
        // inDegree is pre-seeded for every node in the graph, so the value
        // is always defined when nodeMap.has() is true.
        inDegree.set(choice.nextNode, inDegree.get(choice.nextNode)! + 1)
      }
    }
  }
  return inDegree
}

/** Breadth-first traversal result for every node in the graph. */
export interface BfsResult {
  /** BFS depth from the nearest start node; Infinity when unreachable. */
  depth: Map<NodeId, number>
  /**
   * Id of the nearest `scene_start` ancestor on the shortest path from any
   * start node.  `null` when no scene_start ancestor exists on the path, or
   * when the node is unreachable.
   */
  sceneId: Map<NodeId, string | null>
}

/**
 * Performs a multi-source BFS from all nodes of type `start`, propagating
 * depth and the most recently seen `scene_start` id along each path.
 *
 * When a node is reachable via multiple paths the first (shortest) path wins,
 * which gives deterministic results even in graphs with cycles.
 */
export function bfsFromStarts(
  graph: Adventure,
  nodeMap: Map<NodeId, Adventure[number]>,
): BfsResult {
  const depth = new Map<NodeId, number>()
  const sceneId = new Map<NodeId, string | null>()

  // Queue entries: [nodeId, currentDepth, inheritedSceneId]
  const queue: Array<[NodeId, number, string | null]> = []

  for (const node of graph) {
    if (node.node_type === 'start') {
      depth.set(node.id, 0)
      sceneId.set(node.id, null)
      queue.push([node.id, 0, null])
    }
  }

  let head = 0
  while (head < queue.length) {
    const [currentId, currentDepth, inheritedScene] = queue[head++]!
    // nodeMap is always defined for ids we enqueue (we only enqueue ids present
    // in the graph at the start of BFS and after nodeMap.has() checks below).
    const currentNode = nodeMap.get(currentId)!

    // If this node is a scene_start, it is the new scene context for its
    // children.  (The scene_start node itself inherits from its parent.)
    const childScene =
      currentNode.node_type === 'scene_start' ? currentNode.id : inheritedScene

    for (const choice of currentNode.choices) {
      const nextId = choice.nextNode
      if (!nodeMap.has(nextId)) continue
      if (depth.has(nextId)) continue // already visited via a shorter path

      depth.set(nextId, currentDepth + 1)
      sceneId.set(nextId, childScene)
      queue.push([nextId, currentDepth + 1, childScene])
    }
  }

  return { depth, sceneId }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes classifier tags for every node in the adventure in a single pass
 * and returns an immutable map from node id to its tags.
 *
 * This is the most efficient entry point when you need tags for many nodes
 * (e.g., rendering the full canvas or outline).
 */
export function classifyAll(
  graph: Adventure,
): ReadonlyMap<NodeId, ClassifierTags> {
  const nodeMap = buildNodeMap(graph)
  const inDegree = buildInDegreeMap(graph, nodeMap)
  const { depth: depthMap, sceneId: sceneIdMap } = bfsFromStarts(graph, nodeMap)

  const result = new Map<NodeId, ClassifierTags>()

  for (const node of graph) {
    const nodeDepth = depthMap.get(node.id) ?? Infinity
    const tags: ClassifierTags = {
      // inDegree is pre-seeded for every node in buildInDegreeMap, so the
      // non-null assertion is safe here.
      isOrphan:
        inDegree.get(node.id)! === 0 && node.node_type !== 'start',
      isTerminal: isTerminalNodeType(node.node_type),
      isJunction: inDegree.get(node.id)! >= 2,
      isBranch: node.choices.length >= 2,
      isLinearLink: node.choices.length === 1,
      isCheckpoint: node.checkpoint === true,
      sceneId: sceneIdMap.get(node.id) ?? null,
      depth: nodeDepth,
      unreachable: nodeDepth === Infinity,
    }
    result.set(node.id, tags)
  }

  return result
}

/**
 * Returns the classifier tags for a single node.
 *
 * This is the canonical pure-function interface described in the epic:
 * `(graph: Adventure, nodeId: NodeId) => ClassifierTags`
 *
 * Internally it calls `classifyAll`, so callers that need tags for many nodes
 * should prefer `classifyAll` directly to avoid redundant graph traversals.
 *
 * @throws {Error} if `nodeId` does not exist in the graph.
 */
export function classifyNode(graph: Adventure, nodeId: NodeId): ClassifierTags {
  const all = classifyAll(graph)
  const tags = all.get(nodeId)
  if (tags === undefined) {
    throw new Error(`classifyNode: node "${nodeId}" not found in graph`)
  }
  return tags
}
