import type { AdventureNode } from '../types/adventure'

/** Opaque alias for node ids — always the `id` field of an AdventureNode. */
export type NodeId = AdventureNode['id']

/**
 * All classifier tags derived from graph structure alone.
 * Tags are never stored in the adventure document — they are computed on
 * demand from the current graph state and used by both the canvas and outline
 * view modes.
 */
export interface ClassifierTags {
  /**
   * True when no other node's choice points to this node AND this node is not
   * of type `start`.  An orphan can never be reached by the player.
   */
  isOrphan: boolean

  /**
   * True when the node's `node_type` is `end` or `adventure_success`.
   * Terminal nodes must have an empty `choices` array (enforced by schema).
   */
  isTerminal: boolean

  /**
   * True when two or more other nodes have a choice whose `nextNode` points
   * here — i.e., in-degree ≥ 2.
   */
  isJunction: boolean

  /**
   * True when the node has two or more choices — i.e., out-degree ≥ 2.
   */
  isBranch: boolean

  /**
   * True when the node has exactly one choice — out-degree = 1.
   */
  isLinearLink: boolean

  /**
   * True when the node's `checkpoint` field is explicitly `true`.
   */
  isCheckpoint: boolean

  /**
   * The `id` of the nearest `scene_start` ancestor encountered on the
   * shortest path from any `start` node, or `null` when no `scene_start`
   * ancestor exists (preamble nodes) or the node is unreachable.
   */
  sceneId: string | null

  /**
   * BFS depth from the nearest `start` node.  Unreachable nodes receive
   * `Infinity`.
   */
  depth: number

  /**
   * True when the node cannot be reached from any `start` node by following
   * choice edges.
   */
  unreachable: boolean
}
