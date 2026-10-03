import { describe, it, expect } from 'vitest'
import type { Adventure } from '../../types/adventure'
import cavesFixture from '../../../fixtures/Caves_Of_Bane.json'
import zooFixture from '../../../fixtures/a_strange_day_at_the_zoo.json'
import { buildSceneGraph, sceneKey, PREAMBLE_KEY } from './sceneGraph'
import type { SceneGraph, SceneKey } from './sceneGraph'
import { layoutCanvas } from './sceneLayout'
import type { CanvasLayout, SceneMetrics } from './sceneLayout'
import type { LayoutMetrics, NodeBox } from './treeLayout'
import {
  routeLinks, toSvgPath, segmentHitsBox, simplify, gridRoute, nudgeOverlaps,
} from './linkRouting'
import type { Anchor, Point, RoutedLink } from './linkRouting'

// ---------------------------------------------------------------------------
// Typed fixture imports
// ---------------------------------------------------------------------------

const caves = cavesFixture as Adventure
const zoo = zooFixture as Adventure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const M: LayoutMetrics = { nodeWidth: 100, nodeHeight: 20, columnGap: 50, rowGap: 10 }
const S: SceneMetrics = {
  headerHeight: 10, padding: 5, collapsedWidth: 50, collapsedHeight: 10, gapX: 20, gapY: 10,
}

function node(
  id: string,
  type: Adventure[number]['node_type'] = 'decision',
  targets: string[] = [],
): Adventure[number] {
  return {
    id,
    title: id,
    node_type: type,
    narrativeText: '',
    choices: targets.map((nextNode) => ({
      choiceText: '',
      choiceResponseConstraint: 'none',
      nextNode,
    })),
  }
}

interface Routed {
  graph: SceneGraph
  layout: CanvasLayout
  links: RoutedLink[]
}

function route(doc: Adventure, expanded: SceneKey[] | 'all' = 'all', small = true): Routed {
  const graph = buildSceneGraph(doc)
  const keys = expanded === 'all' ? graph.groups.map((g) => g.key) : expanded
  const layout = small
    ? layoutCanvas(graph, new Set(keys), M, S)
    : layoutCanvas(graph, new Set(keys))
  const links = small ? routeLinks(graph, layout, M, S) : routeLinks(graph, layout)
  return { graph, layout, links }
}

function find(r: Routed, from: string, to: string): RoutedLink {
  const link = r.links.find((l) => l.from === from && l.to === to)
  if (link === undefined) throw new Error(`no routed link ${from} → ${to}`)
  return link
}

function anchorBox(r: Routed, a: Anchor): NodeBox {
  return a.type === 'node' ? r.layout.nodes.get(a.id)! : r.layout.scenes.get(a.key)!
}

function onBorder(p: Point, b: NodeBox): boolean {
  const inX = p.x >= b.x && p.x <= b.x + b.width
  const inY = p.y >= b.y && p.y <= b.y + b.height
  return (inY && (p.x === b.x || p.x === b.x + b.width))
    || (inX && (p.y === b.y || p.y === b.y + b.height))
}

function strictlyInside(p: Point, b: NodeBox): boolean {
  return p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height
}

/** Every rule a routed link must satisfy; returns human-readable problems. */
function problems(r: Routed): string[] {
  const out: string[] = []
  for (const link of r.links) {
    const name = `${link.from}→${link.to}#${link.choiceIndex}`
    const pts = link.points
    if (pts.length < 2) out.push(`${name}: fewer than two points`)
    const diagonal = new Set<number>()
    for (let i = 1; i < pts.length; i++) {
      if (pts[i]!.x !== pts[i - 1]!.x && pts[i]!.y !== pts[i - 1]!.y) {
        out.push(`${name}: segment ${i} is diagonal`)
        diagonal.add(i)
      }
    }

    const fromBox = anchorBox(r, link.fromAnchor)
    const toBox = anchorBox(r, link.toAnchor)
    if (!onBorder(pts[0]!, fromBox)) out.push(`${name}: does not start on its source`)
    if (!onBorder(pts.at(-1)!, toBox)) out.push(`${name}: does not end on its target`)
    if (strictlyInside(pts[1]!, fromBox)) out.push(`${name}: leaves into its own source`)
    if (strictlyInside(pts.at(-2)!, toBox)) out.push(`${name}: arrives from inside its target`)

    // Obstacles: every visible card except its own endpoints…
    const own = new Set<string>()
    if (link.fromAnchor.type === 'node') own.add(link.fromAnchor.id)
    if (link.toAnchor.type === 'node') own.add(link.toAnchor.id)
    const obstacles: [string, NodeBox][] = []
    for (const [id, box] of r.layout.nodes) if (!own.has(id)) obstacles.push([`node ${id}`, box])
    // …and every scene box other than the scenes it starts or ends in.
    const ownScenes = new Set([r.graph.groupOf.get(link.from), r.graph.groupOf.get(link.to)])
    for (const [key, box] of r.layout.scenes) {
      if (!ownScenes.has(key)) obstacles.push([`scene ${key}`, box])
    }
    for (let i = 1; i < pts.length; i++) {
      if (diagonal.has(i)) continue
      for (const [label, box] of obstacles) {
        if (segmentHitsBox(pts[i - 1]!, pts[i]!, box)) out.push(`${name}: crosses ${label}`)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// OPS-577 example diagram (final stage)
// ---------------------------------------------------------------------------

const diagram: Adventure = [
  node('start', 'start', ['n1', 'n2']),
  node('n1', 'decision', ['n3', 'n4']),
  node('n2', 'decision', ['n5']),
  node('n3'),
  node('n4', 'decision', ['n6', 'n7']),
  node('n5'), node('n6'),
  node('n7', 'decision', ['n5']),
]

// s → sc1 → a → sc2 → b; a → s; b → sc1; b → a
const scenes: Adventure = [
  node('s', 'start', ['sc1']),
  node('sc1', 'scene_start', ['a']),
  node('a', 'decision', ['sc2', 's']),
  node('sc2', 'scene_start', ['b']),
  node('b', 'decision', ['sc1', 'a']),
]

// ---------------------------------------------------------------------------
// The validator itself must be able to fail
// ---------------------------------------------------------------------------

describe('problems() — test validator self-check', () => {
  it('reports a link drawn straight through another card', () => {
    const r = route(diagram)
    const link = find(r, 'n7', 'n5')
    const n7 = r.layout.nodes.get('n7')!
    const n4 = r.layout.nodes.get('n4')!
    // Straight left from n7 at n4's height, then down into n5's top.
    const y = n4.y + n4.height / 2
    link.points = [
      { x: n7.x, y: n7.y + n7.height / 2 },
      { x: n7.x - 10, y: n7.y + n7.height / 2 },
      { x: n7.x - 10, y },
      { x: 355, y },
      { x: 355, y: 105 },
    ]
    expect(problems(r)).toContain('n7→n5#0: crosses node n4')
  })

  it('reports diagonal segments and wrong endpoints', () => {
    const r = route(diagram)
    const link = find(r, 'start', 'n1')
    link.points = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    expect(problems(r)).toEqual(expect.arrayContaining([
      'start→n1#0: segment 1 is diagonal',
      'start→n1#0: does not start on its source',
      'start→n1#0: does not end on its target',
    ]))
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('toSvgPath', () => {
  it('draws a polyline as move-then-line commands', () => {
    expect(toSvgPath([{ x: 0, y: 1 }, { x: 5, y: 1 }, { x: 5, y: 9 }])).toBe('M 0 1 L 5 1 L 5 9')
  })
})

describe('simplify', () => {
  it('drops repeated points and the middle of straight runs', () => {
    expect(simplify([
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 4 },
    ])).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 4 }])
  })

  it('folds a run that doubles back on itself', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 4, y: 0 }]))
      .toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }])
  })
})

describe('segmentHitsBox', () => {
  const box = { x: 10, y: 10, width: 20, height: 10 }

  it('detects horizontal and vertical segments through a box', () => {
    expect(segmentHitsBox({ x: 0, y: 15 }, { x: 40, y: 15 }, box)).toBe(true)
    expect(segmentHitsBox({ x: 20, y: 0 }, { x: 20, y: 40 }, box)).toBe(true)
  })

  it('does not count touching the border or passing beside', () => {
    expect(segmentHitsBox({ x: 0, y: 10 }, { x: 40, y: 10 }, box)).toBe(false)
    expect(segmentHitsBox({ x: 30, y: 0 }, { x: 30, y: 40 }, box)).toBe(false)
    expect(segmentHitsBox({ x: 0, y: 15 }, { x: 10, y: 15 }, box)).toBe(false)
  })

  it('grows the box by the margin', () => {
    expect(segmentHitsBox({ x: 0, y: 8 }, { x: 40, y: 8 }, box, 4)).toBe(true)
  })

  it('rejects diagonal segments', () => {
    expect(() => segmentHitsBox({ x: 0, y: 0 }, { x: 5, y: 5 }, box)).toThrow('not orthogonal')
  })
})

describe('gridRoute', () => {
  it('goes straight when nothing is in the way', () => {
    expect(gridRoute({ x: 0, y: 0 }, { x: 50, y: 0 }, [])).toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }])
  })

  it('detours around an obstacle on the direct line', () => {
    const wall = { x: 20, y: -20, width: 10, height: 40 }
    const path = gridRoute({ x: 0, y: 0 }, { x: 50, y: 0 }, [wall])
    expect(path[0]).toEqual({ x: 0, y: 0 })
    expect(path.at(-1)).toEqual({ x: 50, y: 0 })
    for (let i = 1; i < path.length; i++) {
      expect(segmentHitsBox(path[i - 1]!, path[i]!, wall)).toBe(false)
    }
  })

  it('falls back to an L-shape when the start is boxed in', () => {
    const cage = { x: -10, y: -10, width: 20, height: 20 }
    expect(gridRoute({ x: 0, y: 0 }, { x: 50, y: 30 }, [cage]))
      .toEqual([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }])
  })
})

describe('nudgeOverlaps', () => {
  // Two paths that both run down x = 50 between y = 0 and y = 100.
  const pair = (): Point[][] => [
    [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 90, y: 100 }],
    [{ x: 0, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 80 }, { x: 90, y: 80 }],
  ]

  it('spreads overlapping segments symmetrically about the shared line', () => {
    const paths = pair()
    nudgeOverlaps(paths, [])
    expect(paths[0]![1]!.x).toBe(47)
    expect(paths[0]![2]!.x).toBe(47)
    expect(paths[1]![1]!.x).toBe(53)
    expect(paths[1]![2]!.x).toBe(53)
  })

  it('never moves the first or last point of a path', () => {
    const paths = pair()
    nudgeOverlaps(paths, [])
    expect(paths[0]![0]).toEqual({ x: 0, y: 0 })
    expect(paths[0]![3]).toEqual({ x: 90, y: 100 })
  })

  it('shrinks the spacing to keep clear of nearby boxes', () => {
    const paths = pair()
    // A box whose right edge is 5 px left of the line leaves 1 px of room.
    nudgeOverlaps(paths, [{ x: 0, y: 40, width: 45, height: 10 }])
    expect(paths[0]![1]!.x).toBe(49)
    expect(paths[1]![1]!.x).toBe(51)
  })

  it('ignores boxes beside the span and boxes that contain the line', () => {
    const paths = pair()
    nudgeOverlaps(paths, [
      { x: 40, y: 200, width: 20, height: 20 }, // below the span
      { x: 0, y: -50, width: 200, height: 300 }, // contains the line
      { x: 56, y: 10, width: 20, height: 10 }, // right of the line, 2 px room
    ])
    expect(paths[0]![1]!.x).toBe(48)
    expect(paths[1]![1]!.x).toBe(52)
  })

  it('leaves collinear segments that do not overlap alone', () => {
    const paths: Point[][] = [
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 40 }, { x: 90, y: 40 }],
      [{ x: 0, y: 60 }, { x: 50, y: 60 }, { x: 50, y: 100 }, { x: 90, y: 100 }],
    ]
    nudgeOverlaps(paths, [])
    expect(paths[0]![1]!.x).toBe(50)
    expect(paths[1]![1]!.x).toBe(50)
  })

  it('spreads two segments of one path that share a line with another path', () => {
    const paths: Point[][] = [
      [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 30 }, { x: 70, y: 30 },
        { x: 70, y: 40 }, { x: 50, y: 40 }, { x: 50, y: 60 }, { x: 0, y: 60 },
      ],
      [{ x: 90, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 50 }, { x: 90, y: 50 }],
    ]
    nudgeOverlaps(paths, [])
    expect([paths[0]![1]!.x, paths[0]![5]!.x, paths[1]![1]!.x]).toEqual([44, 50, 56])
  })
})

// ---------------------------------------------------------------------------
// Links inside an expanded scene
// ---------------------------------------------------------------------------

describe('routeLinks — inside an expanded scene', () => {
  it('draws a tree link as right side → gutter trunk → left side', () => {
    const r = route(diagram)
    // start box (5, 71.25); n1 box (155, 37.5); gutter centre x = 5 + 100 + 25
    expect(find(r, 'start', 'n1').points).toEqual([
      { x: 105, y: 81.25 }, { x: 130, y: 81.25 }, { x: 130, y: 47.5 }, { x: 155, y: 47.5 },
    ])
  })

  it('shares one trunk between siblings', () => {
    const r = route(diagram)
    expect(find(r, 'start', 'n1').points[1]!.x).toBe(find(r, 'start', 'n2').points[1]!.x)
  })

  it('routes Node 7 → Node 5 out of the bottom, left, and into the top (diagram stage 6)', () => {
    const r = route(diagram)
    const link = find(r, 'n7', 'n5')
    expect(link.kind).toBe('back')
    expect(link.isBack).toBe(true)
    // n7 box (455, 75)–(555, 95); n5 box (305, 105)–(405, 125)
    expect(link.points).toEqual([
      { x: 505, y: 95 }, { x: 505, y: 100 }, { x: 355, y: 100 }, { x: 355, y: 105 },
    ])
  })

  it('routes a forward cross link through the gutters into the target', () => {
    const r = route([
      node('s', 'start', ['a', 'b']),
      node('a', 'decision', ['c']),
      node('b', 'decision', ['c']),
      node('c'),
    ])
    const link = find(r, 'b', 'c')
    expect(link.kind).toBe('cross')
    expect(link.isBack).toBe(false)
    expect(problems(r)).toEqual([])
  })

  it('finds a free lane when a column blocks the direct line', () => {
    // n9 (column 1) sits between the source in column 2 and the target in
    // column 0, so the back link must cross column 1 above or below it.
    const r = route([
      node('s', 'start', ['n1', 'n9']),
      node('n1', 'decision', ['n2']),
      node('n2', 'decision', ['s']),
      node('n9'),
    ])
    expect(problems(r)).toEqual([])
  })

  it('loops a self-link round the right of its node', () => {
    const r = route([node('s', 'start', ['s'])])
    const link = find(r, 's', 's')
    const box = r.layout.nodes.get('s')!
    expect(link.points[0]!.y).toBe(box.y + box.height)
    expect(link.points.at(-1)!.y).toBe(box.y)
    expect(Math.max(...link.points.map((p) => p.x))).toBeGreaterThan(box.x + box.width)
    expect(problems(r)).toEqual([])
  })

  it('routes a link between nodes in the same column through one gutter', () => {
    const r = route([node('s', 'start', ['a', 'b']), node('a', 'decision', ['b']), node('b')])
    const xs = new Set(find(r, 'a', 'b').points.slice(1, -1).map((p) => p.x))
    expect(problems(r)).toEqual([])
    expect(xs.size).toBeLessThanOrEqual(2)
  })

  it('draws nothing for links inside a collapsed scene', () => {
    expect(route(diagram, []).links).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Links between scenes
// ---------------------------------------------------------------------------

describe('routeLinks — between scenes', () => {
  it('joins collapsed scenes right-middle to left-middle', () => {
    const r = route(scenes, [])
    const link = find(r, 's', 'sc1')
    expect(link.fromAnchor).toEqual({ type: 'scene', key: PREAMBLE_KEY })
    expect(link.toAnchor).toEqual({ type: 'scene', key: sceneKey('sc1') })
    // The preamble's only connector leaves at its middle; sc1 has two
    // incoming connectors, so this one enters a third of the way down.
    expect(link.points[0]).toEqual({ x: 50, y: 5 })
    expect(link.points.at(-1)).toEqual({ x: 70, y: 10 / 3 })
    expect(link.isBack).toBe(false)
  })

  it('spreads several connectors down the side of a collapsed scene', () => {
    const r = route(scenes, [])
    const arrivals = r.links
      .filter((l) => l.toAnchor.type === 'scene' && l.toAnchor.key === sceneKey('sc1'))
      .map((l) => l.points.at(-1)!.y)
    expect(arrivals).toEqual([10 / 3, 20 / 3])
  })

  it('merges links that join the same pair of collapsed scenes', () => {
    const r = route([
      node('s', 'start', ['sc1', 'p']),
      node('p', 'decision', ['sc1']),
      node('sc1', 'scene_start'),
    ], [])
    expect(r.links).toHaveLength(1)
    expect(r.links[0]).toMatchObject({ from: 's', to: 'sc1', count: 2 })
  })

  it('marks a link back to an earlier scene as a back link', () => {
    const r = route(scenes, [])
    expect(find(r, 'b', 'sc1').isBack).toBe(true)
    expect(problems(r)).toEqual([])
  })

  it('leaves an expanded scene from the exit node and enters the next scene’s entry', () => {
    const r = route(scenes)
    const link = find(r, 'a', 'sc2')
    expect(link.fromAnchor).toEqual({ type: 'node', id: 'a' })
    expect(link.toAnchor).toEqual({ type: 'node', id: 'sc2' })
    const entry = r.layout.nodes.get('sc2')!
    expect(link.points.at(-1)).toEqual({ x: entry.x, y: entry.y + entry.height / 2 })
    expect(problems(r)).toEqual([])
  })

  it('enters a non-entry node of an expanded scene from the left', () => {
    const r = route(scenes)
    const link = find(r, 'b', 'a')
    expect(link.kind).toBe('scene-cross')
    expect(link.points.at(-1)!.x).toBe(r.layout.nodes.get('a')!.x)
    expect(problems(r)).toEqual([])
  })

  it('mixes expanded and collapsed endpoints', () => {
    expect(problems(route(scenes, [sceneKey('sc1')]))).toEqual([])
    expect(problems(route(scenes, [PREAMBLE_KEY, sceneKey('sc2')]))).toEqual([])
  })

  it('takes a lane round blocking cards when leaving and entering scenes', () => {
    // The exit node x1 sits left of x2, which blocks its row; the entry into
    // y3 must pass y1/y2 in earlier columns.
    const r = route([
      node('s', 'start', ['sx']),
      node('sx', 'scene_start', ['x1', 'xa']),
      node('x1', 'decision', ['x2', 'sy']),
      node('x2'),
      node('xa', 'decision', ['xb']),
      node('xb'),
      node('sy', 'scene_start', ['y1']),
      node('y1', 'decision', ['y2']),
      node('y2', 'decision', ['y3']),
      node('y3'),
      node('o', 'decision', ['y3']),
    ])
    expect(problems(r)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Fixtures — every rule, every collapsed / expanded combination
// ---------------------------------------------------------------------------

describe.each([
  ['Caves_Of_Bane', caves],
  ['a_strange_day_at_the_zoo', zoo],
])('routeLinks — %s fixture', (_name, doc) => {
  const graph = buildSceneGraph(doc)
  const keys = graph.groups.map((g) => g.key)
  const combos: [string, SceneKey[]][] = [
    ['all collapsed', []],
    ['all expanded', keys],
    ['alternate expanded', keys.filter((_, i) => i % 2 === 0)],
    ['alternate collapsed', keys.filter((_, i) => i % 2 === 1)],
    ...keys.map((k): [string, SceneKey[]] => [`only ${k} expanded`, [k]]),
  ]

  describe.each(combos)('%s', (_label, expandedKeys) => {
    const r = route(doc, expandedKeys, false)

    it('never passes behind a card or scene it is not attached to', () => {
      expect(problems(r)).toEqual([])
    })

    it('draws every visible link exactly once', () => {
      const expanded = new Set(expandedKeys)
      const visible = graph.links.filter((l) => {
        const g = graph.groupOf.get(l.from)!
        return g !== graph.groupOf.get(l.to) || expanded.has(g)
      })
      expect(r.links.reduce((sum, l) => sum + l.count, 0)).toBe(visible.length)
    })

    it('is deterministic', () => {
      expect(route(doc, expandedKeys, false).links).toEqual(r.links)
    })
  })
})

describe('routeLinks — performance', () => {
  // A regression guard, not a frame budget: `yarn test` runs with coverage
  // instrumentation, which slows this code roughly ten-fold.  Uninstrumented
  // it takes ≈ 16 ms with every scene expanded and ≈ 2 ms with all collapsed.
  it('routes Caves_Of_Bane with every scene expanded without a slowdown', () => {
    const graph = buildSceneGraph(caves)
    const layout = layoutCanvas(graph, new Set(graph.groups.map((g) => g.key)))
    let best = Infinity
    for (let run = 0; run < 3; run++) {
      const t0 = performance.now()
      routeLinks(graph, layout)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(400)
  })
})
