import { describe, it, expect } from 'vitest'
import type { Adventure } from '../../types/adventure'
import cavesFixture from '../../../fixtures/Caves_Of_Bane.json'
import zooFixture from '../../../fixtures/a_strange_day_at_the_zoo.json'
import { buildSceneGraph, sceneKey, PREAMBLE_KEY, UNREACHABLE_KEY } from './sceneGraph'
import type { SceneKey } from './sceneGraph'
import { layoutCanvas, DEFAULT_SCENE_METRICS } from './sceneLayout'
import type { CanvasLayout, SceneMetrics } from './sceneLayout'
import type { LayoutMetrics, NodeBox } from './treeLayout'

// ---------------------------------------------------------------------------
// Typed fixture imports
// ---------------------------------------------------------------------------

const caves = cavesFixture as Adventure
const zoo = zooFixture as Adventure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Node metrics with round numbers: column pitch 150, row pitch 30. */
const M: LayoutMetrics = { nodeWidth: 100, nodeHeight: 20, columnGap: 50, rowGap: 10 }
/** Scene metrics with round numbers: collapsed 50 × 10, scene pitch 70. */
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

function layout(doc: Adventure, expanded: SceneKey[] = [], s: SceneMetrics = S): CanvasLayout {
  return layoutCanvas(buildSceneGraph(doc), new Set(expanded), M, s)
}

function box(l: CanvasLayout, key: SceneKey) {
  const { x, y, width, height } = l.scenes.get(key)!
  return { x, y, width, height }
}

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function contains(outer: NodeBox, inner: NodeBox): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height
}

// s → sc1 → a → sc2 → b
const chain: Adventure = [
  node('s', 'start', ['sc1']),
  node('sc1', 'scene_start', ['a']),
  node('a', 'decision', ['sc2']),
  node('sc2', 'scene_start', ['b']),
  node('b'),
]

// s → hub; hub leads into scenes x then y; x holds two nodes.
const branching: Adventure = [
  node('s', 'start', ['hub']),
  node('hub', 'scene_start', ['x', 'y']),
  node('x', 'scene_start', ['x1', 'x2']),
  node('y', 'scene_start', ['y1']),
  node('x1'), node('x2'), node('y1'),
]

// ---------------------------------------------------------------------------
// Basic shapes
// ---------------------------------------------------------------------------

describe('layoutCanvas — basic shapes', () => {
  it('returns an empty canvas for an empty adventure', () => {
    const l = layout([])
    expect(l.scenes.size).toBe(0)
    expect(l.nodes.size).toBe(0)
    expect(l.width).toBe(0)
    expect(l.height).toBe(0)
  })

  it('draws a collapsed group as a fixed-size box with no node cards', () => {
    const l = layout([node('s', 'start', ['a']), node('a')])
    expect(l.scenes.get(PREAMBLE_KEY)).toEqual({
      key: PREAMBLE_KEY, expanded: false, x: 0, y: 0, width: 50, height: 10,
    })
    expect(l.nodes.size).toBe(0)
  })

  it('sizes an expanded group to its tree plus header and padding', () => {
    // inner tree: s → a is 250 × 20
    const l = layout([node('s', 'start', ['a']), node('a')], [PREAMBLE_KEY])
    expect(l.scenes.get(PREAMBLE_KEY)).toMatchObject({ expanded: true, width: 260, height: 40 })
  })

  it('places node cards below the header, inside the padding', () => {
    const l = layout([node('s', 'start', ['a']), node('a')], [PREAMBLE_KEY])
    expect(l.nodes.get('s')).toEqual({ x: 5, y: 15, width: 100, height: 20 })
    expect(l.nodes.get('a')).toEqual({ x: 155, y: 15, width: 100, height: 20 })
  })

  it('never makes an expanded scene narrower than a collapsed one', () => {
    const l = layout([node('s', 'start')], [PREAMBLE_KEY], { ...S, collapsedWidth: 300 })
    expect(box(l, PREAMBLE_KEY).width).toBe(300)
  })

  it('uses the default metrics when none are given', () => {
    const l = layoutCanvas(buildSceneGraph([node('s', 'start')]), new Set())
    expect(box(l, PREAMBLE_KEY)).toEqual({
      x: 0, y: 0,
      width: DEFAULT_SCENE_METRICS.collapsedWidth,
      height: DEFAULT_SCENE_METRICS.collapsedHeight,
    })
  })
})

// ---------------------------------------------------------------------------
// Flow between scenes
// ---------------------------------------------------------------------------

describe('layoutCanvas — scenes flow left to right', () => {
  it('places each scene gapX to the right of the scene that leads into it', () => {
    const l = layout(chain)
    expect(box(l, PREAMBLE_KEY)).toMatchObject({ x: 0, y: 0 })
    expect(box(l, sceneKey('sc1'))).toMatchObject({ x: 70, y: 0 })
    expect(box(l, sceneKey('sc2'))).toMatchObject({ x: 140, y: 0 })
    expect(l.width).toBe(190)
    expect(l.height).toBe(10)
  })

  it('pushes later scenes right when an earlier scene expands', () => {
    // sc1 expanded holds sc1 → a: 250 wide + 10 padding = 260
    const l = layout(chain, [sceneKey('sc1')])
    expect(box(l, sceneKey('sc1')).width).toBe(260)
    expect(box(l, sceneKey('sc2')).x).toBe(70 + 260 + 20)
  })

  it('stacks sibling scenes in discovery order and centres their parent', () => {
    const l = layout(branching)
    expect(box(l, sceneKey('x'))).toMatchObject({ x: 140, y: 0 })
    expect(box(l, sceneKey('y'))).toMatchObject({ x: 140, y: 20 })
    expect(box(l, sceneKey('hub'))).toMatchObject({ x: 70, y: 10 })
    expect(box(l, PREAMBLE_KEY)).toMatchObject({ x: 0, y: 10 })
  })

  it('pushes later siblings down when an earlier sibling expands', () => {
    const collapsed = layout(branching)
    const expanded = layout(branching, [sceneKey('x')])
    // x holds x → x1, x2: tree 250 × 50, box 260 × 70
    expect(box(expanded, sceneKey('x'))).toMatchObject({ y: 0, height: 70 })
    expect(box(expanded, sceneKey('y')).y).toBe(80)
    expect(box(expanded, sceneKey('y')).y).toBeGreaterThan(box(collapsed, sceneKey('y')).y)
    expect(overlaps(expanded.scenes.get(sceneKey('x'))!, expanded.scenes.get(sceneKey('y'))!))
      .toBe(false)
  })

  it('stacks the unreachable group below the preamble', () => {
    const l = layout([node('s', 'start'), node('orphan')])
    expect(box(l, PREAMBLE_KEY)).toMatchObject({ x: 0, y: 0 })
    expect(box(l, UNREACHABLE_KEY)).toMatchObject({ x: 0, y: 20 })
    expect(l.height).toBe(30)
  })

  it('keeps a scene inside its band when centring would push it out', () => {
    // Preamble (200 tall) leads into scene A (290 tall) and scene B (10 tall).
    // Centring between A and B would put the preamble at y = 125, overlapping
    // the unreachable group below; it is clamped to y = 110 instead.
    const flat: SceneMetrics = { ...S, headerHeight: 0, padding: 0 }
    const leaves = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)
    const doc: Adventure = [
      node('s', 'start', [...leaves('l', 7), 'scA', 'scB']),
      ...leaves('l', 7).map((id) => node(id)),
      node('scA', 'scene_start', leaves('a', 10)),
      ...leaves('a', 10).map((id) => node(id)),
      node('scB', 'scene_start'),
      node('orphan'),
    ]
    const l = layout(doc, [PREAMBLE_KEY, sceneKey('scA')], flat)
    expect(box(l, sceneKey('scA'))).toMatchObject({ y: 0, height: 290 })
    expect(box(l, sceneKey('scB'))).toMatchObject({ y: 300 })
    expect(box(l, PREAMBLE_KEY)).toMatchObject({ y: 110, height: 200 })
    expect(box(l, UNREACHABLE_KEY)).toMatchObject({ y: 320 })
  })
})

// ---------------------------------------------------------------------------
// Fixtures — invariants across collapsed / expanded combinations
// ---------------------------------------------------------------------------

describe.each([
  ['Caves_Of_Bane', caves],
  ['a_strange_day_at_the_zoo', zoo],
])('layoutCanvas — %s fixture', (_name, doc) => {
  const graph = buildSceneGraph(doc)
  const keys = graph.groups.map((g) => g.key)
  const combos: [string, SceneKey[]][] = [
    ['all collapsed', []],
    ['all expanded', keys],
    ['alternate expanded', keys.filter((_, i) => i % 2 === 0)],
    ...keys.map((k): [string, SceneKey[]] => [`only ${k} expanded`, [k]]),
  ]

  describe.each(combos)('%s', (_label, expandedKeys) => {
    const expanded = new Set(expandedKeys)
    const l = layoutCanvas(graph, expanded)

    it('draws a box for every group and node cards for expanded groups only', () => {
      expect([...l.scenes.keys()].sort()).toEqual([...keys].sort())
      const expectedNodes = graph.groups
        .filter((g) => expanded.has(g.key))
        .flatMap((g) => g.nodeIds)
      expect([...l.nodes.keys()].sort()).toEqual(expectedNodes.sort())
    })

    it('never overlaps two scene boxes', () => {
      const boxes = [...l.scenes.values()]
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false)
        }
      }
    })

    it('keeps every node card inside its own scene, below the header', () => {
      for (const group of graph.groups) {
        if (!expanded.has(group.key)) continue
        const scene = l.scenes.get(group.key)!
        const body = {
          ...scene,
          y: scene.y + DEFAULT_SCENE_METRICS.headerHeight,
          height: scene.height - DEFAULT_SCENE_METRICS.headerHeight,
        }
        for (const id of group.nodeIds) expect(contains(body, l.nodes.get(id)!)).toBe(true)
      }
    })

    it('places every scene to the right of the scene that leads into it', () => {
      for (const group of graph.groups) {
        if (group.parentKey === null) continue
        const parent = l.scenes.get(group.parentKey)!
        expect(l.scenes.get(group.key)!.x)
          .toBe(parent.x + parent.width + DEFAULT_SCENE_METRICS.gapX)
      }
    })

    it('stacks sibling scenes in discovery order', () => {
      for (const group of graph.groups) {
        const ys = group.childKeys.map((k) => l.scenes.get(k)!.y)
        expect(ys).toEqual([...ys].sort((a, b) => a - b))
      }
    })

    it('reports a canvas size that contains every scene', () => {
      for (const scene of l.scenes.values()) {
        expect(contains({ x: 0, y: 0, width: l.width, height: l.height }, scene)).toBe(true)
      }
    })

    it('is deterministic', () => {
      expect(layoutCanvas(graph, new Set(expandedKeys))).toEqual(l)
    })
  })
})

describe('layoutCanvas — Caves_Of_Bane overview', () => {
  it('fits a 1200 px wide viewport at 56% zoom with every scene collapsed', () => {
    const l = layoutCanvas(buildSceneGraph(caves), new Set())
    expect(l.width * 0.56).toBeLessThanOrEqual(1200)
  })
})
