import type { NodeId } from '../../classifier'
import type { SceneGraph, SceneKey } from './sceneGraph'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Pixel dimensions used by the flow canvas layout. */
export interface LayoutMetrics {
  /** Node card width — matches `MiniNode` (160 px). */
  nodeWidth: number
  /** Node card height — `MiniNode` must render at exactly this height. */
  nodeHeight: number
  /** Horizontal gutter between columns; links are routed through it. */
  columnGap: number
  /** Vertical gap between neighbouring subtree bands. */
  rowGap: number
}

export const DEFAULT_METRICS: LayoutMetrics = {
  nodeWidth: 160,
  nodeHeight: 52,
  columnGap: 64,
  rowGap: 16,
}

/** A node card's position, relative to its group's top-left corner. */
export interface NodeBox {
  x: number
  y: number
  width: number
  height: number
}

export interface GroupLayout {
  nodes: ReadonlyMap<NodeId, NodeBox>
  /** Bounding box of every node in the group (origin is always 0,0). */
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Lays out one scene group as a left-to-right tidy tree over its tree links.
 *
 * - Column `c` sits at `x = c × (nodeWidth + columnGap)`; roots are column 0.
 * - Every subtree owns a horizontal band tall enough for all its leaves, and
 *   sibling bands are stacked top to bottom in choice order — so a growing
 *   subtree pushes later siblings down rather than overlapping them.
 * - A parent is centred between its first and last child.
 * - Multiple roots (several start nodes, or unreachable seeds) are stacked
 *   in root order as if they shared an invisible parent.
 *
 * Pure and deterministic.  Runs in O(n) for the n nodes in the group.
 *
 * @throws {Error} if `groupKey` is not a group of `graph`.
 */
export function layoutGroup(
  graph: SceneGraph,
  groupKey: SceneKey,
  metrics: LayoutMetrics = DEFAULT_METRICS,
): GroupLayout {
  const group = graph.groups.find((g) => g.key === groupKey)
  if (group === undefined) {
    throw new Error(`layoutGroup: group "${groupKey}" not found`)
  }

  const { nodeWidth, nodeHeight, columnGap, rowGap } = metrics
  const childrenOf = (id: NodeId) => graph.treeChildren.get(id) ?? []

  // Band height of every subtree, computed children-first.  Reversed BFS
  // order guarantees each node's children are measured before it.
  const band = new Map<NodeId, number>()
  for (let i = group.nodeIds.length - 1; i >= 0; i--) {
    const id = group.nodeIds[i]!
    band.set(id, Math.max(nodeHeight, stackHeight(childrenOf(id), band, rowGap)))
  }

  const nodes = new Map<NodeId, NodeBox>()

  // Places the subtree rooted at `id` in the band starting at `top` and
  // returns the vertical centre of the node it placed.
  const place = (id: NodeId, top: number): number => {
    const kids = childrenOf(id)
    let centre: number
    if (kids.length === 0) {
      centre = top + band.get(id)! / 2
    } else {
      let childTop = top + (band.get(id)! - stackHeight(kids, band, rowGap)) / 2
      const centres: number[] = []
      for (const kid of kids) {
        centres.push(place(kid, childTop))
        childTop += band.get(kid)! + rowGap
      }
      centre = (centres[0]! + centres.at(-1)!) / 2
    }
    nodes.set(id, {
      x: graph.column.get(id)! * (nodeWidth + columnGap),
      y: centre - nodeHeight / 2,
      width: nodeWidth,
      height: nodeHeight,
    })
    return centre
  }

  let top = 0
  for (const root of group.rootIds) {
    place(root, top)
    top += band.get(root)! + rowGap
  }

  let maxColumn = 0
  for (const id of group.nodeIds) maxColumn = Math.max(maxColumn, graph.column.get(id)!)

  return {
    nodes,
    width: (maxColumn + 1) * nodeWidth + maxColumn * columnGap,
    height: stackHeight(group.rootIds, band, rowGap),
  }
}

/** Total height of a stack of bands separated by `rowGap`. */
function stackHeight(
  ids: readonly NodeId[],
  band: ReadonlyMap<NodeId, number>,
  rowGap: number,
): number {
  if (ids.length === 0) return 0
  let total = rowGap * (ids.length - 1)
  for (const id of ids) total += band.get(id)!
  return total
}
