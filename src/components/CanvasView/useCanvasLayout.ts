import { useMemo } from 'react'
import type { Adventure, AdventureNode } from '../../types/adventure'
import type { ClassifierTags, NodeId } from '../../classifier'

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 72
/** Horizontal gap between depth columns. */
export const COLUMN_GAP = 80
/** Vertical gap between nodes within the same column. */
export const ROW_GAP = 20
/** Additional horizontal gap before the orphan / unreachable column. */
const ORPHAN_EXTRA_GAP = 80
/** Padding around the whole diagram. */
const PADDING = 40

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PositionedNode {
  id: string
  title: string
  nodeType: AdventureNode['node_type']
  tags: ClassifierTags
  /** Top-left x coordinate. */
  x: number
  /** Top-left y coordinate. */
  y: number
  width: number
  height: number
  /** Number of outgoing choices (for display). */
  choiceCount: number
}

export interface PositionedEdge {
  /** Unique key for React: `${sourceId}--${choiceIndex}`. */
  id: string
  sourceId: string
  targetId: string
  choiceText: string
  /** Right-centre of the source box. */
  x1: number
  y1: number
  /** Left-centre of the target box. */
  x2: number
  y2: number
}

export interface CanvasLayout {
  nodes: PositionedNode[]
  edges: PositionedEdge[]
  totalWidth: number
  totalHeight: number
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Transforms the adventure document + classifier cache into a positioned
 * layout ready for SVG rendering.
 *
 * Uses BFS depth from the classifier as the column (x-axis) coordinate.
 * Orphan / unreachable nodes are placed in a separate column to the right.
 *
 * Memoised: re-runs only when `document` or `classifierCache` changes.
 */
export function useCanvasLayout(
  document: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): CanvasLayout {
  return useMemo(() => computeLayout(document, classifierCache), [document, classifierCache])
}

// ---------------------------------------------------------------------------
// Layout computation (pure — exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Pure layout function — exported so it can be unit-tested without React.
 */
export function computeLayout(
  adventure: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): CanvasLayout {
  if (adventure.length === 0) {
    return { nodes: [], edges: [], totalWidth: 0, totalHeight: 0 }
  }

  // Bucket nodes into depth groups. Unreachable / Infinity-depth nodes go into
  // the orphan bucket which is rendered in its own column on the far right.
  const depthGroups = new Map<number, AdventureNode[]>()
  const orphanBucket: AdventureNode[] = []

  for (const node of adventure) {
    const tags = classifierCache.get(node.id)
    if (!tags || !isFinite(tags.depth)) {
      orphanBucket.push(node)
    } else {
      const group = depthGroups.get(tags.depth) ?? []
      group.push(node)
      depthGroups.set(tags.depth, group)
    }
  }

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b)

  // Calculate the x-position for each depth column.
  const columnX = new Map<number, number>()
  let currentX = PADDING
  for (const depth of sortedDepths) {
    columnX.set(depth, currentX)
    currentX += NODE_WIDTH + COLUMN_GAP
  }
  // Orphan column sits after an extra gap.
  const orphanColumnX = orphanBucket.length > 0 ? currentX + ORPHAN_EXTRA_GAP : 0

  // Position every node and record its coordinates.
  const positionMap = new Map<string, { x: number; y: number }>()
  const positionedNodes: PositionedNode[] = []

  function placeGroup(nodes: AdventureNode[], colX: number) {
    nodes.forEach((node, i) => {
      const x = colX
      const y = PADDING + i * (NODE_HEIGHT + ROW_GAP)
      positionMap.set(node.id, { x, y })
      const tags = classifierCache.get(node.id)!
      positionedNodes.push({
        id: node.id,
        title: node.title,
        nodeType: node.node_type,
        tags,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        choiceCount: node.choices.length,
      })
    })
  }

  for (const depth of sortedDepths) {
    placeGroup(depthGroups.get(depth)!, columnX.get(depth)!)
  }
  if (orphanBucket.length > 0) {
    placeGroup(orphanBucket, orphanColumnX)
  }

  // Build edges from choices.
  const edges: PositionedEdge[] = []
  for (const node of adventure) {
    const srcPos = positionMap.get(node.id)
    if (!srcPos) continue
    for (let i = 0; i < node.choices.length; i++) {
      const choice = node.choices[i]!
      if (!choice.nextNode) continue
      const tgtPos = positionMap.get(choice.nextNode)
      if (!tgtPos) continue // dangling reference — skip silently

      edges.push({
        id: `${node.id}--${i}`,
        sourceId: node.id,
        targetId: choice.nextNode,
        choiceText: choice.choiceText,
        // Right-centre of source box
        x1: srcPos.x + NODE_WIDTH,
        y1: srcPos.y + NODE_HEIGHT / 2,
        // Left-centre of target box
        x2: tgtPos.x,
        y2: tgtPos.y + NODE_HEIGHT / 2,
      })
    }
  }

  // Compute total bounding box.
  let maxX = 0
  let maxY = 0
  for (const n of positionedNodes) {
    maxX = Math.max(maxX, n.x + NODE_WIDTH)
    maxY = Math.max(maxY, n.y + NODE_HEIGHT)
  }

  return {
    nodes: positionedNodes,
    edges,
    totalWidth: maxX + PADDING,
    totalHeight: maxY + PADDING,
  }
}

// ---------------------------------------------------------------------------
// Edge path helper (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Generates an SVG cubic-bezier path string for an edge.
 *
 * - Forward edges (target to the right): smooth S-curve.
 * - Back edges (target to the left or same column): route above both nodes
 *   so arrows do not overlap the boxes.
 */
export function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1
  if (dx > 0) {
    // Forward edge — symmetric bezier
    const offset = Math.max(60, Math.abs(dx) * 0.45)
    return `M ${x1} ${y1} C ${x1 + offset} ${y1} ${x2 - offset} ${y2} ${x2} ${y2}`
  } else {
    // Back edge — arc over the top of both nodes
    const arcY = Math.min(y1, y2) - Math.max(60, Math.abs(dx) * 0.3)
    const offset = 60
    return `M ${x1} ${y1} C ${x1 + offset} ${arcY} ${x2 - offset} ${arcY} ${x2} ${y2}`
  }
}
