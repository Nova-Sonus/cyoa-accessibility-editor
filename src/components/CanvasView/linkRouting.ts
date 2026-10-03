import type { NodeId } from '../../classifier'
import type { LinkKind, SceneGraph, SceneKey } from './sceneGraph'
import { DEFAULT_SCENE_METRICS } from './sceneLayout'
import type { CanvasLayout, SceneBox, SceneMetrics } from './sceneLayout'
import { DEFAULT_METRICS } from './treeLayout'
import type { LayoutMetrics, NodeBox } from './treeLayout'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface Point {
  x: number
  y: number
}

/** What a link is drawn from or to: a visible node card or a collapsed scene. */
export type Anchor =
  | { type: 'node'; id: NodeId }
  | { type: 'scene'; key: SceneKey }

export interface RoutedLink {
  /** The first choice link (document order) this connector represents. */
  from: NodeId
  to: NodeId
  choiceIndex: number
  kind: LinkKind
  fromAnchor: Anchor
  toAnchor: Anchor
  /**
   * Orthogonal polyline: every segment is horizontal or vertical.  The first
   * point lies on the source's border, the last on the target's border, and
   * the final segment points into the target (where the arrowhead goes).
   */
  points: Point[]
  /** True for links that loop back (same/earlier column, or earlier scene). */
  isBack: boolean
  /** Number of choice links merged into this connector (collapsed scenes). */
  count: number
}

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Length of the stub that leaves or enters a scene box. */
const STUB = 8
/** Minimum distance a link keeps from any box it is not attached to. */
const CLEARANCE = 4
/** Distance from scene boxes of the scene-level routing grid lines. */
const GRID_OFFSET = 12
/** Extra cost of a bend, in pixels of length, for scene-level routes. */
const BEND_COST = 40
/** Offsets from a gutter's centre line (where tree trunks run) for other
 *  links, so parallel links in one gutter stay distinguishable. */
const LANE_OFFSETS = [-8, 8, -14, 14, -20, 20, -26, 26]

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/**
 * Routes every visible link on the flow canvas as an orthogonal polyline
 * that never passes behind a node card or scene box it is not attached to.
 *
 * - **Tree links** (expanded scene): right side → gutter trunk → left side,
 *   so siblings share a trunk that splits to each child.
 * - **Back / cross links** (expanded scene): leave the source's top or bottom
 *   into the gap beside it, travel in column gutters, cross intervening
 *   columns at a height free of cards, and enter the target's top or bottom.
 * - **Scene links**: leave the source scene along a free lane, are routed
 *   around every scene box with a minimum-bend search, and enter the target
 *   scene (or its node) from the left.
 * - Links inside a collapsed scene are not drawn.  Links whose endpoints both
 *   resolve to the same pair of anchors are merged (`count`).
 *
 * Pure and deterministic.
 */
export function routeLinks(
  graph: SceneGraph,
  layout: CanvasLayout,
  metrics: LayoutMetrics = DEFAULT_METRICS,
  sceneMetrics: SceneMetrics = DEFAULT_SCENE_METRICS,
): RoutedLink[] {
  const { nodeWidth, columnGap, rowGap } = metrics
  const sceneBoxes = [...layout.scenes.values()]

  // Column structure of every expanded scene.
  const channels = new Map<SceneKey, SceneChannels>()
  for (const group of graph.groups) {
    const box = layout.scenes.get(group.key)!
    if (!box.expanded) continue
    const columns: NodeBox[][] = []
    for (const id of group.nodeIds) {
      const c = graph.column.get(id)!
      ;(columns[c] ??= []).push(layout.nodes.get(id)!)
    }
    channels.set(group.key, {
      box,
      columns: columns.map((col) => [...col].sort((a, b) => a.y - b.y)),
      topLane: box.y + sceneMetrics.headerHeight + sceneMetrics.padding / 2,
      bottomLane: box.y + box.height - sceneMetrics.padding / 2,
    })
  }

  const gutterCentre = (ch: SceneChannels, c: number) =>
    ch.box.x + sceneMetrics.padding + c * (nodeWidth + columnGap) + nodeWidth + columnGap / 2

  const laneUse = new Map<string, number>()
  const laneX = (key: SceneKey, ch: SceneChannels, c: number) => {
    const gutter = `${key}|${c}`
    const n = laneUse.get(gutter) ?? 0
    laneUse.set(gutter, n + 1)
    return gutterCentre(ch, c) + LANE_OFFSETS[n % LANE_OFFSETS.length]!
  }

  /**
   * Returns a y at which a horizontal line crosses columns `from..to` of a
   * scene without touching a card.  Tries `preferred` in order, then the
   * gaps between cards nearest to `preferred[0]`, then the scene's top and
   * bottom padding lanes (always free).  An empty range accepts `preferred[0]`.
   */
  const findLane = (ch: SceneChannels, from: number, to: number, preferred: number[]): number => {
    if (from > to) return preferred[0]!
    for (const y of preferred) if (isFree(ch, from, to, y)) return y

    const candidates = [ch.topLane, ch.bottomLane]
    for (let c = from; c <= to; c++) {
      for (const b of ch.columns[c]!) {
        candidates.push(b.y - rowGap / 2, b.y + b.height + rowGap / 2)
      }
    }
    const target = preferred[0]!
    let best = ch.bottomLane
    for (const y of candidates) {
      if (!isFree(ch, from, to, y)) continue
      const d = Math.abs(y - target)
      const bestD = Math.abs(best - target)
      if (d < bestD || (d === bestD && y < best)) best = y
    }
    return best
  }

  const anchorOf = (id: NodeId): Anchor => {
    const key = graph.groupOf.get(id)!
    return channels.has(key) ? { type: 'node', id } : { type: 'scene', key }
  }

  // --- Paths that leave / enter a scene ------------------------------------

  /**
   * Path from an anchor to a point just outside the right of its scene.
   * `portY` is where a collapsed scene's connector leaves its right side.
   */
  const exitPath = (anchor: Anchor, portY: number): Point[] => {
    if (anchor.type === 'scene') {
      const b = layout.scenes.get(anchor.key)!
      return [{ x: b.x + b.width, y: portY }, { x: b.x + b.width + STUB, y: portY }]
    }
    const key = graph.groupOf.get(anchor.id)!
    const ch = channels.get(key)!
    const s = layout.nodes.get(anchor.id)!
    const c = graph.column.get(anchor.id)!
    const outX = ch.box.x + ch.box.width + STUB
    const y = findLane(ch, c + 1, ch.columns.length - 1, [cy(s)])
    if (y === cy(s)) return [{ x: s.x + s.width, y }, { x: outX, y }]
    const x = laneX(key, ch, c)
    return [{ x: s.x + s.width, y: cy(s) }, { x, y: cy(s) }, { x, y }, { x: outX, y }]
  }

  /**
   * Path from a point just outside the left of a scene to an anchor.
   * `portY` is where a collapsed scene's connector enters its left side.
   */
  const entryPath = (anchor: Anchor, portY: number): Point[] => {
    if (anchor.type === 'scene') {
      const b = layout.scenes.get(anchor.key)!
      return [{ x: b.x - STUB, y: portY }, { x: b.x, y: portY }]
    }
    const key = graph.groupOf.get(anchor.id)!
    const ch = channels.get(key)!
    const t = layout.nodes.get(anchor.id)!
    const c = graph.column.get(anchor.id)!
    const inX = ch.box.x - STUB
    const y = findLane(ch, 0, c - 1, [cy(t)])
    if (y === cy(t)) return [{ x: inX, y }, { x: t.x, y }]
    const x = laneX(key, ch, c - 1)
    return [{ x: inX, y }, { x, y }, { x, y: cy(t) }, { x: t.x, y: cy(t) }]
  }

  // --- Routes ----------------------------------------------------------------

  const treeRoute = (key: SceneKey, from: NodeId, to: NodeId): Point[] => {
    const p = layout.nodes.get(from)!
    const c = layout.nodes.get(to)!
    const x = gutterCentre(channels.get(key)!, graph.column.get(from)!)
    return [
      { x: p.x + p.width, y: cy(p) },
      { x, y: cy(p) },
      { x, y: cy(c) },
      { x: c.x, y: cy(c) },
    ]
  }

  const channelRoute = (key: SceneKey, from: NodeId, to: NodeId): Point[] => {
    const ch = channels.get(key)!
    const s = layout.nodes.get(from)!
    const t = layout.nodes.get(to)!
    const cs = graph.column.get(from)!
    const ct = graph.column.get(to)!

    // Leave towards the target's side; enter from above unless coming up.
    const exitTop = cy(t) < cy(s)
    const enterTop = !exitTop
    const ys = exitTop ? s.y - rowGap / 2 : s.y + s.height + rowGap / 2
    const yt = enterTop ? t.y - rowGap / 2 : t.y + t.height + rowGap / 2

    const xs = laneX(key, ch, cs)
    const targetGutter = ct > cs ? ct - 1 : ct
    const xt = targetGutter === cs ? xs : laneX(key, ch, targetGutter)
    const yl = ct > cs
      ? findLane(ch, cs + 1, ct - 1, [yt, ys])
      : findLane(ch, ct + 1, cs, [yt, ys])

    return [
      { x: cx(s), y: exitTop ? s.y : s.y + s.height },
      { x: cx(s), y: ys },
      { x: xs, y: ys },
      { x: xs, y: yl },
      { x: xt, y: yl },
      { x: xt, y: yt },
      { x: cx(t), y: yt },
      { x: cx(t), y: enterTop ? t.y : t.y + t.height },
    ]
  }

  const sceneRoute = (link: RoutedLink, outPort: number, inPort: number): Point[] => {
    const exit = exitPath(link.fromAnchor, outPort)
    const entry = entryPath(link.toAnchor, inPort)
    const middle = gridRoute(exit.at(-1)!, entry[0]!, sceneBoxes)
    return [...exit, ...middle, ...entry]
  }

  // --- Main loop -------------------------------------------------------------

  const routed: RoutedLink[] = []
  const merged = new Map<string, RoutedLink>()
  const sceneLinks: RoutedLink[] = []

  for (const link of graph.links) {
    const fromKey = graph.groupOf.get(link.from)!
    const toKey = graph.groupOf.get(link.to)!

    if (fromKey === toKey) {
      if (!channels.has(fromKey)) continue // inside a collapsed scene
      const points = link.kind === 'tree'
        ? treeRoute(fromKey, link.from, link.to)
        : channelRoute(fromKey, link.from, link.to)
      routed.push({
        from: link.from,
        to: link.to,
        choiceIndex: link.choiceIndex,
        kind: link.kind,
        fromAnchor: { type: 'node', id: link.from },
        toAnchor: { type: 'node', id: link.to },
        points: simplify(points),
        isBack: link.kind === 'back',
        count: 1,
      })
      continue
    }

    const fromAnchor = anchorOf(link.from)
    const toAnchor = anchorOf(link.to)
    const mergeKey = `${anchorKey(fromAnchor)}>${anchorKey(toAnchor)}`
    const existing = merged.get(mergeKey)
    if (existing !== undefined) {
      existing.count++
      continue
    }

    const fromScene = layout.scenes.get(fromKey)!
    const toScene = layout.scenes.get(toKey)!
    const entry: RoutedLink = {
      from: link.from,
      to: link.to,
      choiceIndex: link.choiceIndex,
      kind: link.kind,
      fromAnchor,
      toAnchor,
      points: [], // routed below, once every connector's port is known
      isBack: toScene.x <= fromScene.x,
      count: 1,
    }
    merged.set(mergeKey, entry)
    routed.push(entry)
    sceneLinks.push(entry)
  }

  // Spread the connectors of each collapsed scene evenly down its sides, so
  // no two arrive at (or leave from) the same point.
  const outPorts = spreadPorts(sceneLinks.map((l) => l.fromAnchor), layout)
  const inPorts = spreadPorts(sceneLinks.map((l) => l.toAnchor), layout)
  sceneLinks.forEach((link, i) => {
    link.points = simplify(sceneRoute(link, outPorts[i]!, inPorts[i]!))
  })

  // Pull apart connectors that share a stretch of the same line.
  const obstacles = [...layout.scenes.values(), ...layout.nodes.values()]
  nudgeOverlaps(sceneLinks.map((l) => l.points), obstacles)

  return routed
}

/**
 * For each connector, the y of its port on its scene anchor: the i-th of k
 * connectors on one side of a collapsed scene sits at (i + 1) / (k + 1) of
 * the box height.  Node anchors get NaN (their path ignores the port).
 */
function spreadPorts(anchors: readonly Anchor[], layout: CanvasLayout): number[] {
  const total = new Map<SceneKey, number>()
  for (const a of anchors) if (a.type === 'scene') total.set(a.key, (total.get(a.key) ?? 0) + 1)
  const used = new Map<SceneKey, number>()
  return anchors.map((a) => {
    if (a.type === 'node') return NaN
    const i = used.get(a.key) ?? 0
    used.set(a.key, i + 1)
    const b = layout.scenes.get(a.key)!
    return b.y + (b.height * (i + 1)) / (total.get(a.key)! + 1)
  })
}

/** Spacing between connectors pulled apart by `nudgeOverlaps`. */
const NUDGE_SPACING = 6

/**
 * Moves apart interior segments of different polylines that lie on the same
 * line and overlap, mutating `paths` in place.  Each cluster of m overlapping
 * segments is spread symmetrically about the shared line, NUDGE_SPACING
 * apart, shrunk if needed so no segment comes within CLEARANCE of an
 * obstacle it was clear of.  First and last segments (the stubs on the
 * anchors) never move, so every path still starts and ends where it did.
 */
export function nudgeOverlaps(paths: Point[][], obstacles: readonly NodeBox[]): void {
  interface Seg { path: number; index: number; vertical: boolean; at: number; lo: number; hi: number }
  const groups = new Map<string, Seg[]>()
  paths.forEach((pts, path) => {
    for (let index = 1; index < pts.length - 2; index++) {
      const a = pts[index]!
      const b = pts[index + 1]!
      const vertical = a.x === b.x
      const at = vertical ? a.x : a.y
      const lo = vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x)
      const hi = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x)
      const key = `${vertical ? 'v' : 'h'}${at}`
      const list = groups.get(key) ?? []
      list.push({ path, index, vertical, at, lo, hi })
      groups.set(key, list)
    }
  })

  const moves: [Seg, number][] = []
  for (const list of groups.values()) {
    list.sort((s, t) => s.lo - t.lo || s.path - t.path)
    // Split into clusters of transitively overlapping segments.
    let cluster: Seg[] = []
    let clusterHi = -Infinity
    const flush = () => {
      if (new Set(cluster.map((s) => s.path)).size > 1) moves.push(...spread(cluster, obstacles))
      cluster = []
    }
    for (const seg of list) {
      if (seg.lo >= clusterHi) {
        flush()
        clusterHi = -Infinity
      }
      cluster.push(seg)
      clusterHi = Math.max(clusterHi, seg.hi)
    }
    flush()
  }

  for (const [seg, offset] of moves) {
    const pts = paths[seg.path]!
    for (const p of [pts[seg.index]!, pts[seg.index + 1]!]) {
      if (seg.vertical) p.x = seg.at + offset
      else p.y = seg.at + offset
    }
  }

  function spread(cluster: Seg[], boxes: readonly NodeBox[]): [Seg, number][] {
    const ordered = [...cluster].sort((s, t) => s.path - t.path || s.index - t.index)
    const half = (ordered.length - 1) / 2
    // Free room either side of the shared line over the cluster's span.
    let below = Infinity
    let above = Infinity
    const { vertical, at } = ordered[0]!
    const lo = Math.min(...ordered.map((s) => s.lo))
    const hi = Math.max(...ordered.map((s) => s.hi))
    for (const b of boxes) {
      const [bLo, bHi, bNear, bFar] = vertical
        ? [b.y, b.y + b.height, b.x, b.x + b.width]
        : [b.x, b.x + b.width, b.y, b.y + b.height]
      if (bHi < lo || bLo > hi) continue // beside the span, not across it
      if (bFar <= at) below = Math.min(below, at - bFar - CLEARANCE)
      else if (bNear >= at) above = Math.min(above, bNear - at - CLEARANCE)
      // A box straddling the line contains it (an expanded scene) — ignore.
    }
    const spacing = Math.max(0, Math.min(NUDGE_SPACING, below / half, above / half))
    return ordered.map((s, i) => [s, (i - half) * spacing])
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

/** SVG path data for a polyline. */
export function toSvgPath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

/**
 * True when the segment a–b passes through the interior of `box` grown by
 * `margin` on every side.  Touching the (grown) border does not count.
 */
export function segmentHitsBox(a: Point, b: Point, box: NodeBox, margin = 0): boolean {
  const left = box.x - margin
  const right = box.x + box.width + margin
  const top = box.y - margin
  const bottom = box.y + box.height + margin
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  if (minY === maxY) return minY > top && minY < bottom && maxX > left && minX < right
  if (minX === maxX) return minX > left && minX < right && maxY > top && minY < bottom
  throw new Error('segmentHitsBox: segment is not orthogonal')
}

/** Removes repeated points and the middle point of any straight run. */
export function simplify(points: readonly Point[]): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out.at(-1)
    if (last !== undefined && last.x === p.x && last.y === p.y) continue
    const prev = out.at(-2)
    if (prev !== undefined && last !== undefined
      && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) {
      out[out.length - 1] = p
      continue
    }
    out.push(p)
  }
  return out
}

/**
 * Minimum-bend orthogonal route from `start` to `end` around `obstacles`,
 * over a grid of lines offset `GRID_OFFSET` from every obstacle edge.  The
 * route leaves `start` and reaches `end` horizontally where possible.
 * Returns the intermediate bend points plus `start` and `end`.
 */
export function gridRoute(start: Point, end: Point, obstacles: readonly NodeBox[]): Point[] {
  const xs = uniqueSorted([
    start.x, end.x,
    ...obstacles.flatMap((o) => [o.x - GRID_OFFSET, o.x + o.width + GRID_OFFSET]),
  ])
  const ys = uniqueSorted([
    start.y, end.y,
    ...obstacles.flatMap((o) => [o.y - GRID_OFFSET, o.y + o.height + GRID_OFFSET]),
  ])
  const nx = xs.length
  const ny = ys.length
  const pointAt = (k: number): Point => ({ x: xs[k % nx]!, y: ys[Math.floor(k / nx)]! })

  // Which grid edges are free of obstacles, computed once: east[k] is the
  // edge from point k to its right-hand neighbour, south[k] to the one below.
  const clear = (a: Point, b: Point) => obstacles.every((o) => !segmentHitsBox(a, b, o, CLEARANCE))
  const east = new Uint8Array(nx * ny)
  const south = new Uint8Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      if (i + 1 < nx && clear(pointAt(k), pointAt(k + 1))) east[k] = 1
      if (j + 1 < ny && clear(pointAt(k), pointAt(k + nx))) south[k] = 1
    }
  }

  const startK = ys.indexOf(start.y) * nx + xs.indexOf(start.x)
  const endK = ys.indexOf(end.y) * nx + xs.indexOf(end.x)

  // State = point index × orientation (0 horizontal, 1 vertical).
  const total = nx * ny * 2
  const dist = new Float64Array(total).fill(Infinity)
  const prev = new Int32Array(total).fill(-1)
  const heap = new MinHeap()
  dist[startK * 2] = 0
  heap.push(0, startK * 2)

  while (heap.size > 0) {
    const [d, state] = heap.pop()
    if (d > dist[state]!) continue
    const k = state >> 1
    const orientation = state & 1
    const i = k % nx
    // [neighbour index, orientation of the move, edge is clear]
    const moves: [number, number, boolean][] = [
      [k - 1, 0, i > 0 && east[k - 1] === 1],
      [k + 1, 0, east[k] === 1],
      [k - nx, 1, k >= nx && south[k - nx] === 1],
      [k + nx, 1, south[k] === 1],
    ]
    const here = pointAt(k)
    for (const [nk, o, ok] of moves) {
      if (!ok) continue
      const there = pointAt(nk)
      const cost = d + Math.abs(there.x - here.x) + Math.abs(there.y - here.y)
        + (o === orientation ? 0 : BEND_COST)
      const next = nk * 2 + o
      if (cost < dist[next]!) {
        dist[next] = cost
        prev[next] = state
        heap.push(cost, next)
      }
    }
  }

  // Prefer arriving horizontally (the entry stub is horizontal).
  const arriveH = dist[endK * 2]!
  const arriveV = dist[endK * 2 + 1]! + BEND_COST
  if (arriveH === Infinity && arriveV === Infinity) {
    return [start, { x: end.x, y: start.y }, end] // unreachable — never expected
  }
  let state = arriveH <= arriveV ? endK * 2 : endK * 2 + 1
  const path: Point[] = []
  while (state !== -1) {
    path.push(pointAt(state >> 1))
    state = prev[state]!
  }
  return simplify(path.reverse())
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface SceneChannels {
  box: SceneBox
  /** Node cards per column, top to bottom. */
  columns: NodeBox[][]
  /** Free horizontal lanes in the padding above and below all cards. */
  topLane: number
  bottomLane: number
}

function isFree(ch: SceneChannels, from: number, to: number, y: number): boolean {
  for (let c = from; c <= to; c++) {
    for (const b of ch.columns[c]!) {
      if (y > b.y - CLEARANCE && y < b.y + b.height + CLEARANCE) return false
    }
  }
  return true
}

function cx(b: NodeBox): number {
  return b.x + b.width / 2
}

function cy(b: NodeBox): number {
  return b.y + b.height / 2
}

function anchorKey(a: Anchor): string {
  return a.type === 'node' ? `n:${a.id}` : `s:${a.key}`
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
}

/** Binary min-heap of (priority, value) pairs; ties pop the smaller value. */
class MinHeap {
  private items: [number, number][] = []

  get size(): number {
    return this.items.length
  }

  push(priority: number, value: number): void {
    const items = this.items
    items.push([priority, value])
    let i = items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!less(items[i]!, items[parent]!)) break
      ;[items[i], items[parent]] = [items[parent]!, items[i]!]
      i = parent
    }
  }

  pop(): [number, number] {
    const items = this.items
    const top = items[0]!
    const last = items.pop()!
    if (items.length > 0) {
      items[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < items.length && less(items[l]!, items[m]!)) m = l
        if (r < items.length && less(items[r]!, items[m]!)) m = r
        if (m === i) break
        ;[items[i], items[m]] = [items[m]!, items[i]!]
        i = m
      }
    }
    return top
  }
}

function less(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
}
