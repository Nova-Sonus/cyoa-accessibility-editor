import type { NodeId } from '../../classifier'
import type { SceneGraph, SceneKey } from './sceneGraph'
import { DEFAULT_METRICS, layoutGroup } from './treeLayout'
import type { LayoutMetrics, NodeBox } from './treeLayout'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Pixel dimensions of scene boxes on the flow canvas. */
export interface SceneMetrics {
  /** Height of the scene header (title, counts, collapse toggle). */
  headerHeight: number
  /** Space between an expanded scene's border and its node cards. */
  padding: number
  /** Fixed size of a collapsed scene; also the minimum expanded width. */
  collapsedWidth: number
  collapsedHeight: number
  /** Horizontal gutter between a scene and the scenes it leads into. */
  gapX: number
  /** Vertical gap between neighbouring scene bands. */
  gapY: number
}

export const DEFAULT_SCENE_METRICS: SceneMetrics = {
  headerHeight: 36,
  padding: 12,
  collapsedWidth: 180,
  collapsedHeight: 64,
  gapX: 96,
  gapY: 24,
}

export interface SceneBox extends NodeBox {
  key: SceneKey
  expanded: boolean
}

export interface CanvasLayout {
  /** Every scene group's box, in absolute canvas coordinates. */
  scenes: ReadonlyMap<SceneKey, SceneBox>
  /** Node cards of expanded scenes only, in absolute canvas coordinates. */
  nodes: ReadonlyMap<NodeId, NodeBox>
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * Lays out every scene group of the adventure as boxes flowing left to right.
 *
 * - Groups with no parent (preamble, then unreachable) are stacked at x = 0.
 * - A scene sits `gapX` to the right of the scene that leads into it.
 * - Each scene owns a band tall enough for itself and every scene after it;
 *   sibling bands stack in discovery order, so expanding a scene pushes
 *   later siblings down and its successors right — nothing overlaps.
 * - A scene is centred between its first and last successor, clamped so it
 *   never leaves its own band.
 * - Expanded scenes contain their `layoutGroup` tree below the header;
 *   collapsed scenes are a fixed-size box and contribute no node cards.
 *
 * Pure and deterministic.  `expanded` holds the keys of expanded groups; it
 * is UI state and never stored in the adventure document.
 */
export function layoutCanvas(
  graph: SceneGraph,
  expanded: ReadonlySet<SceneKey>,
  metrics: LayoutMetrics = DEFAULT_METRICS,
  sceneMetrics: SceneMetrics = DEFAULT_SCENE_METRICS,
): CanvasLayout {
  const { headerHeight, padding, collapsedWidth, collapsedHeight, gapX, gapY } = sceneMetrics
  const childrenOf = (key: SceneKey) => graph.groups.find((g) => g.key === key)!.childKeys

  // Size of every scene box; the inner tree for expanded ones.
  const size = new Map<SceneKey, { width: number; height: number }>()
  const inner = new Map<SceneKey, ReadonlyMap<NodeId, NodeBox>>()
  for (const group of graph.groups) {
    if (expanded.has(group.key)) {
      const tree = layoutGroup(graph, group.key, metrics)
      inner.set(group.key, tree.nodes)
      size.set(group.key, {
        width: Math.max(collapsedWidth, tree.width + 2 * padding),
        height: headerHeight + tree.height + 2 * padding,
      })
    } else {
      size.set(group.key, { width: collapsedWidth, height: collapsedHeight })
    }
  }

  // Band height of every scene, successors first.  Groups are listed in
  // discovery order, so walking them in reverse measures children first.
  const band = new Map<SceneKey, number>()
  for (let i = graph.groups.length - 1; i >= 0; i--) {
    const key = graph.groups[i]!.key
    band.set(key, Math.max(size.get(key)!.height, stackHeight(childrenOf(key), band, gapY)))
  }

  const scenes = new Map<SceneKey, SceneBox>()
  const nodes = new Map<NodeId, NodeBox>()

  // Places the scene `key` with its left edge at `x` in the band starting at
  // `top`, then its successors; returns the vertical centre of its box.
  const place = (key: SceneKey, x: number, top: number): number => {
    const { width, height } = size.get(key)!
    const kids = childrenOf(key)
    let centre: number
    if (kids.length === 0) {
      centre = top + band.get(key)! / 2
    } else {
      let childTop = top + (band.get(key)! - stackHeight(kids, band, gapY)) / 2
      const centres: number[] = []
      for (const kid of kids) {
        centres.push(place(kid, x + width + gapX, childTop))
        childTop += band.get(kid)! + gapY
      }
      centre = (centres[0]! + centres.at(-1)!) / 2
    }
    const y = Math.min(Math.max(centre - height / 2, top), top + band.get(key)! - height)

    scenes.set(key, { key, expanded: inner.has(key), x, y, width, height })
    for (const [id, box] of inner.get(key) ?? []) {
      nodes.set(id, { ...box, x: x + padding + box.x, y: y + headerHeight + padding + box.y })
    }
    return y + height / 2
  }

  const roots = graph.groups.filter((g) => g.parentKey === null).map((g) => g.key)
  let top = 0
  for (const root of roots) {
    place(root, 0, top)
    top += band.get(root)! + gapY
  }

  let width = 0
  for (const box of scenes.values()) width = Math.max(width, box.x + box.width)

  return { scenes, nodes, width, height: stackHeight(roots, band, gapY) }
}

/** Total height of a stack of bands separated by `gap`. */
function stackHeight(
  keys: readonly SceneKey[],
  band: ReadonlyMap<SceneKey, number>,
  gap: number,
): number {
  if (keys.length === 0) return 0
  let total = gap * (keys.length - 1)
  for (const key of keys) total += band.get(key)!
  return total
}
