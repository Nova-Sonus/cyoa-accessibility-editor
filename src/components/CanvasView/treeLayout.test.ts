import { describe, it, expect } from 'vitest'
import type { Adventure } from '../../types/adventure'
import cavesFixture from '../../../fixtures/Caves_Of_Bane.json'
import zooFixture from '../../../fixtures/a_strange_day_at_the_zoo.json'
import { buildSceneGraph, PREAMBLE_KEY, UNREACHABLE_KEY } from './sceneGraph'
import { layoutGroup, DEFAULT_METRICS } from './treeLayout'
import type { GroupLayout, LayoutMetrics, NodeBox } from './treeLayout'

// ---------------------------------------------------------------------------
// Typed fixture imports
// ---------------------------------------------------------------------------

const caves = cavesFixture as Adventure
const zoo = zooFixture as Adventure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round numbers so expected positions can be worked out by hand:
 *  column pitch 150 px, row pitch 30 px. */
const M: LayoutMetrics = { nodeWidth: 100, nodeHeight: 20, columnGap: 50, rowGap: 10 }

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

function layoutPreamble(doc: Adventure, metrics: LayoutMetrics = M): GroupLayout {
  return layoutGroup(buildSceneGraph(doc), PREAMBLE_KEY, metrics)
}

function pos(layout: GroupLayout, id: string): { x: number; y: number } {
  const box = layout.nodes.get(id)!
  return { x: box.x, y: box.y }
}

const centreY = (box: NodeBox) => box.y + box.height / 2

function overlaps(a: NodeBox, b: NodeBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

// ---------------------------------------------------------------------------
// The six stages of the OPS-577 example diagram
// ---------------------------------------------------------------------------

const stage1: Adventure = [node('start', 'start')]
const stage2: Adventure = [node('start', 'start', ['n1']), node('n1')]
const stage3: Adventure = [node('start', 'start', ['n1', 'n2']), node('n1'), node('n2')]
const stage4: Adventure = [
  node('start', 'start', ['n1', 'n2']), node('n1', 'decision', ['n3']), node('n2'), node('n3'),
]
const stage5: Adventure = [
  node('start', 'start', ['n1', 'n2']),
  node('n1', 'decision', ['n3', 'n4']),
  node('n2', 'decision', ['n5']),
  node('n3'), node('n4'), node('n5'),
]
const stage6: Adventure = [
  node('start', 'start', ['n1', 'n2']),
  node('n1', 'decision', ['n3', 'n4']),
  node('n2', 'decision', ['n5']),
  node('n3'),
  node('n4', 'decision', ['n6', 'n7']),
  node('n5'), node('n6'),
  node('n7', 'decision', ['n5']),
]
const stages = [stage1, stage2, stage3, stage4, stage5, stage6]

describe('layoutGroup — OPS-577 diagram stages', () => {
  it('stage 1: a lone start node sits at the origin', () => {
    const layout = layoutPreamble(stage1)
    expect(pos(layout, 'start')).toEqual({ x: 0, y: 0 })
    expect(layout.width).toBe(100)
    expect(layout.height).toBe(20)
  })

  it('stage 2: a new choice puts the new node to the right, level with its parent', () => {
    const layout = layoutPreamble(stage2)
    expect(pos(layout, 'start')).toEqual({ x: 0, y: 0 })
    expect(pos(layout, 'n1')).toEqual({ x: 150, y: 0 })
  })

  it('stage 3: a second choice goes under the first, with the parent centred', () => {
    const layout = layoutPreamble(stage3)
    expect(pos(layout, 'n1')).toEqual({ x: 150, y: 0 })
    expect(pos(layout, 'n2')).toEqual({ x: 150, y: 30 })
    expect(pos(layout, 'start')).toEqual({ x: 0, y: 15 })
  })

  it('stage 4: a choice from Node 1 continues its row to the right', () => {
    const layout = layoutPreamble(stage4)
    expect(pos(layout, 'n3')).toEqual({ x: 300, y: 0 })
    expect(pos(layout, 'n1')).toEqual({ x: 150, y: 0 })
  })

  it('stage 5: Node 1 growing pushes Node 2 down below its band', () => {
    const layout = layoutPreamble(stage5)
    expect(pos(layout, 'n3')).toEqual({ x: 300, y: 0 })
    expect(pos(layout, 'n4')).toEqual({ x: 300, y: 30 })
    expect(pos(layout, 'n1')).toEqual({ x: 150, y: 15 })
    expect(pos(layout, 'n5')).toEqual({ x: 300, y: 60 })
    expect(pos(layout, 'n2')).toEqual({ x: 150, y: 60 })
    expect(pos(layout, 'start')).toEqual({ x: 0, y: 37.5 })
  })

  it('stage 6: Node 7 linking to Node 5 does not move Node 5', () => {
    const layout = layoutPreamble(stage6)
    expect(pos(layout, 'n6')).toEqual({ x: 450, y: 30 })
    expect(pos(layout, 'n7')).toEqual({ x: 450, y: 60 })
    expect(pos(layout, 'n4')).toEqual({ x: 300, y: 45 })
    expect(pos(layout, 'n3')).toEqual({ x: 300, y: 0 })
    expect(pos(layout, 'n1')).toEqual({ x: 150, y: 22.5 })
    // n5 stays in its home row beside n2
    expect(pos(layout, 'n5')).toEqual({ x: 300, y: 90 })
    expect(pos(layout, 'n2')).toEqual({ x: 150, y: 90 })
    expect(pos(layout, 'start')).toEqual({ x: 0, y: 56.25 })
    expect(layout.width).toBe(550)
    expect(layout.height).toBe(110)
  })

  it('never reorders existing siblings as the diagram grows', () => {
    for (let i = 1; i < stages.length; i++) {
      const before = layoutPreamble(stages[i - 1]!)
      const after = layoutPreamble(stages[i]!)
      const ids = [...before.nodes.keys()]
      for (const a of ids) {
        for (const b of ids) {
          if (pos(before, a).x !== pos(before, b).x) continue // same column only
          const wasAbove = pos(before, a).y < pos(before, b).y
          if (wasAbove) expect(pos(after, a).y).toBeLessThan(pos(after, b).y)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Other shapes
// ---------------------------------------------------------------------------

describe('layoutGroup — other shapes', () => {
  it('uses the default metrics (160 × 52 cards) when none are given', () => {
    const layout = layoutGroup(buildSceneGraph(stage2), PREAMBLE_KEY)
    expect(layout.nodes.get('start')).toEqual({ x: 0, y: 0, width: 160, height: 52 })
    expect(pos(layout, 'n1').x).toBe(DEFAULT_METRICS.nodeWidth + DEFAULT_METRICS.columnGap)
  })

  it('stacks several roots top to bottom in root order', () => {
    const doc = [node('s1', 'start', ['a']), node('s2', 'start'), node('a')]
    const layout = layoutPreamble(doc)
    expect(pos(layout, 's1')).toEqual({ x: 0, y: 0 })
    expect(pos(layout, 'a')).toEqual({ x: 150, y: 0 })
    expect(pos(layout, 's2')).toEqual({ x: 0, y: 30 })
    expect(layout.height).toBe(50)
  })

  it('lays out a scene group from its own entry at the origin', () => {
    const doc = [
      node('s', 'start', ['sc']),
      node('sc', 'scene_start', ['a', 'b']),
      node('a'), node('b'),
    ]
    const layout = layoutGroup(buildSceneGraph(doc), 'scene:sc', M)
    expect([...layout.nodes.keys()].sort()).toEqual(['a', 'b', 'sc'])
    expect(pos(layout, 'sc')).toEqual({ x: 0, y: 15 })
    expect(pos(layout, 'a')).toEqual({ x: 150, y: 0 })
  })

  it('lays out the unreachable group', () => {
    const doc = [node('s', 'start'), node('o', 'decision', ['p']), node('p')]
    const layout = layoutGroup(buildSceneGraph(doc), UNREACHABLE_KEY, M)
    expect(pos(layout, 'o')).toEqual({ x: 0, y: 0 })
    expect(pos(layout, 'p')).toEqual({ x: 150, y: 0 })
  })

  it('throws for an unknown group key', () => {
    expect(() => layoutGroup(buildSceneGraph(stage1), 'scene:nope')).toThrow(
      'layoutGroup: group "scene:nope" not found',
    )
  })
})

// ---------------------------------------------------------------------------
// Fixtures — layout invariants for every group
// ---------------------------------------------------------------------------

describe.each([
  ['Caves_Of_Bane', caves],
  ['a_strange_day_at_the_zoo', zoo],
])('layoutGroup — %s fixture', (_name, doc) => {
  const graph = buildSceneGraph(doc)
  const layouts = graph.groups.map((g) => [g, layoutGroup(graph, g.key)] as const)

  it('positions every node of every group', () => {
    for (const [group, layout] of layouts) {
      expect([...layout.nodes.keys()].sort()).toEqual([...group.nodeIds].sort())
    }
  })

  it('never overlaps two node cards', () => {
    for (const [, layout] of layouts) {
      const boxes = [...layout.nodes.values()]
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false)
        }
      }
    }
  })

  it('places roots in the leftmost column and every child right of its parent', () => {
    for (const [group, layout] of layouts) {
      for (const root of group.rootIds) expect(layout.nodes.get(root)!.x).toBe(0)
      for (const id of group.nodeIds) {
        for (const kid of graph.treeChildren.get(id) ?? []) {
          expect(layout.nodes.get(kid)!.x).toBeGreaterThan(layout.nodes.get(id)!.x)
        }
      }
    }
  })

  it('stacks siblings in choice order and centres each parent between them', () => {
    for (const [group, layout] of layouts) {
      for (const id of group.nodeIds) {
        const kids = graph.treeChildren.get(id) ?? []
        if (kids.length === 0) continue
        const ys = kids.map((k) => layout.nodes.get(k)!.y)
        expect(ys).toEqual([...ys].sort((a, b) => a - b))
        const first = centreY(layout.nodes.get(kids[0]!)!)
        const last = centreY(layout.nodes.get(kids.at(-1)!)!)
        expect(centreY(layout.nodes.get(id)!)).toBeCloseTo((first + last) / 2)
      }
    }
  })

  it('reports a bounding box that contains every card', () => {
    for (const [, layout] of layouts) {
      for (const box of layout.nodes.values()) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(layout.width)
        expect(box.y + box.height).toBeLessThanOrEqual(layout.height)
      }
    }
  })

  it('is deterministic', () => {
    for (const [group, layout] of layouts) {
      expect(layoutGroup(graph, group.key)).toEqual(layout)
    }
  })
})

describe('layoutGroup — performance', () => {
  it('lays out every Caves_Of_Bane group well within a 16 ms frame', () => {
    const graph = buildSceneGraph(caves)
    // Best of several runs, to keep the check stable on a busy machine.
    let best = Infinity
    for (let run = 0; run < 5; run++) {
      const t0 = performance.now()
      for (const group of graph.groups) layoutGroup(graph, group.key)
      best = Math.min(best, performance.now() - t0)
    }
    expect(best).toBeLessThan(16)
  })
})
