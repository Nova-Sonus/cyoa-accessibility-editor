import type { NodeId } from '../../classifier'
import type { SceneKey } from './sceneGraph'
import type { CanvasLayout, SceneBox } from './sceneLayout'
import type { NodeBox } from './treeLayout'
import type { Point, RoutedLink } from './linkRouting'
import type { View } from './usePanZoom'

// ---------------------------------------------------------------------------
// Animated re-layout (OPS-583) — pure helpers, exported for unit testing
// ---------------------------------------------------------------------------

/** Length of the re-layout animation in ms (OPS-583 allows at most 250). */
export const RELAYOUT_MS = 200

/** Space kept between a node brought into view and the viewport edge. */
export const KEEP_VISIBLE_MARGIN = 24

/** Everything the canvas draws: the layout, its routed links and the view. */
export interface CanvasFrame {
  layout: CanvasLayout
  links: readonly RoutedLink[]
  view: View
}

/** Items with no earlier position to move from; they fade in instead. */
export interface Entering {
  scenes: ReadonlySet<SceneKey>
  nodes: ReadonlySet<NodeId>
  links: ReadonlySet<string>
}

/** A frame part-way through a re-layout. */
export interface TweenFrame extends CanvasFrame {
  entering: Entering
  /** Opacity of the entering items (equals the eased progress). */
  enterOpacity: number
}

export const NOTHING_ENTERING: Entering = { scenes: new Set(), nodes: new Set(), links: new Set() }

/** Decelerating curve: quick start, gentle settle. */
export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t))
  return 1 - u * u * u
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** `to` with its position and size moved fraction `k` of the way from `from`. */
export function mixBox<B extends NodeBox>(from: NodeBox, to: B, k: number): B {
  return {
    ...to,
    x: mix(from.x, to.x, k),
    y: mix(from.y, to.y, k),
    width: mix(from.width, to.width, k),
    height: mix(from.height, to.height, k),
  }
}

export function mixPoints(from: readonly Point[], to: readonly Point[], k: number): Point[] {
  return to.map((p, i) => ({ x: mix(from[i]!.x, p.x, k), y: mix(from[i]!.y, p.y, k) }))
}

export function mixView(from: View, to: View, k: number): View {
  return { zoom: mix(from.zoom, to.zoom, k), x: mix(from.x, to.x, k), y: mix(from.y, to.y, k) }
}

/** Stable identity of a routed link: one per source choice. */
export function linkKey(link: Pick<RoutedLink, 'from' | 'choiceIndex'>): string {
  return `${link.from}#${link.choiceIndex}`
}

/**
 * The frame fraction `k` (already eased) of the way from `from` to `to`.
 *
 * Scenes, cards and links present in both frames move; a link moves only if
 * its route keeps the same number of points (otherwise the shapes cannot be
 * matched and it fades in on its new route).  Items new in `to` are drawn at
 * their final place and listed in `entering`; items absent from `to` are gone.
 */
export function interpolateFrame(from: CanvasFrame, to: CanvasFrame, k: number): TweenFrame {
  if (k >= 1) return { ...to, entering: NOTHING_ENTERING, enterOpacity: 1 }

  const scenes = new Map<SceneKey, SceneBox>()
  const enteringScenes = new Set<SceneKey>()
  for (const [key, box] of to.layout.scenes) {
    const prev = from.layout.scenes.get(key)
    if (prev === undefined) enteringScenes.add(key)
    scenes.set(key, prev === undefined ? box : mixBox(prev, box, k))
  }

  const nodes = new Map<NodeId, NodeBox>()
  const enteringNodes = new Set<NodeId>()
  for (const [id, box] of to.layout.nodes) {
    const prev = from.layout.nodes.get(id)
    if (prev === undefined) enteringNodes.add(id)
    nodes.set(id, prev === undefined ? box : mixBox(prev, box, k))
  }

  const fromLinks = new Map(from.links.map((l) => [linkKey(l), l]))
  const enteringLinks = new Set<string>()
  const links = to.links.map((link) => {
    const key = linkKey(link)
    const prev = fromLinks.get(key)
    if (prev === undefined || prev.points.length !== link.points.length) {
      enteringLinks.add(key)
      return link
    }
    return { ...link, points: mixPoints(prev.points, link.points, k) }
  })

  return {
    layout: {
      scenes,
      nodes,
      width: mix(from.layout.width, to.layout.width, k),
      height: mix(from.layout.height, to.layout.height, k),
    },
    links,
    view: mixView(from.view, to.view, k),
    entering: { scenes: enteringScenes, nodes: enteringNodes, links: enteringLinks },
    enterOpacity: k,
  }
}

// ---------------------------------------------------------------------------
// Viewport anchoring
// ---------------------------------------------------------------------------

/** What should keep its place on screen through a re-layout. */
export type Anchor = { node: NodeId } | { scene: SceneKey }

function anchorBox(layout: CanvasLayout, anchor: Anchor): NodeBox | undefined {
  return 'node' in anchor ? layout.nodes.get(anchor.node) : layout.scenes.get(anchor.scene)
}

/**
 * The view after a re-layout from `before` to `after`:
 *
 * 1. Pans by however far the anchor moved, so it stays where it was on
 *    screen (an anchor missing from either layout is ignored).
 * 2. Then pans as little as possible to bring each `keepVisible` node fully
 *    into the viewport (with `KEEP_VISIBLE_MARGIN`), in priority order — a
 *    node that cannot fit alongside the earlier ones is skipped.
 *
 * The zoom never changes.  Returns `view` itself when nothing needs to move,
 * and skips step 2 while the viewport is unmeasured (0 × 0).
 */
export function anchorView(
  view: View,
  before: CanvasLayout,
  after: CanvasLayout,
  anchor: Anchor | null,
  keepVisible: readonly NodeId[],
  viewportW: number,
  viewportH: number,
): View {
  let x = view.x
  let y = view.y
  const z = view.zoom

  const was = anchor === null ? undefined : anchorBox(before, anchor)
  const now = anchor === null ? undefined : anchorBox(after, anchor)
  if (was !== undefined && now !== undefined) {
    x -= (now.x - was.x) * z
    y -= (now.y - was.y) * z
  }

  if (viewportW > 0 && viewportH > 0) {
    const m = KEEP_VISIBLE_MARGIN
    // The pans (dx, dy) that keep every node accepted so far in view.
    let loX = -Infinity
    let hiX = Infinity
    let loY = -Infinity
    let hiY = Infinity
    for (const id of keepVisible) {
      const box = after.nodes.get(id)
      if (box === undefined) continue
      const sx = x + box.x * z
      const sy = y + box.y * z
      // A box larger than the viewport is aligned to its top-left margin.
      const minDx = m - sx
      const minDy = m - sy
      const maxDx = Math.max(minDx, viewportW - m - (sx + box.width * z))
      const maxDy = Math.max(minDy, viewportH - m - (sy + box.height * z))
      const nLoX = Math.max(loX, minDx)
      const nHiX = Math.min(hiX, maxDx)
      const nLoY = Math.max(loY, minDy)
      const nHiY = Math.min(hiY, maxDy)
      if (nLoX > nHiX || nLoY > nHiY) continue
      loX = nLoX
      hiX = nHiX
      loY = nLoY
      hiY = nHiY
    }
    x += Math.min(hiX, Math.max(loX, 0))
    y += Math.min(hiY, Math.max(loY, 0))
  }

  return x === view.x && y === view.y ? view : { zoom: z, x, y }
}
