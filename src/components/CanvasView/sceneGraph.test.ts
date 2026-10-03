import { describe, it, expect } from 'vitest'
import { classifyAll } from '../../classifier'
import type { Adventure } from '../../types/adventure'
import cavesFixture from '../../../fixtures/Caves_Of_Bane.json'
import zooFixture from '../../../fixtures/a_strange_day_at_the_zoo.json'
import {
  buildSceneGraph,
  growUnreachableForest,
  sceneKey,
  PREAMBLE_KEY,
  UNREACHABLE_KEY,
} from './sceneGraph'
import type { LinkKind, SceneGraph } from './sceneGraph'

// ---------------------------------------------------------------------------
// Typed fixture imports
// ---------------------------------------------------------------------------

const caves = cavesFixture as Adventure
const zoo = zooFixture as Adventure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
      choiceText: `to ${nextNode}`,
      choiceResponseConstraint: 'none',
      nextNode,
    })),
  }
}

function kindOf(graph: SceneGraph, from: string, to: string, choiceIndex = 0): LinkKind | undefined {
  return graph.links.find(
    (l) => l.from === from && l.to === to && l.choiceIndex === choiceIndex,
  )?.kind
}

// ---------------------------------------------------------------------------
// OPS-577 example diagram, final stage
//
//   Start → N1, N2;  N1 → N3, N4;  N2 → N5;  N4 → N6, N7;  N7 → N5
// ---------------------------------------------------------------------------

const diagram: Adventure = [
  node('start', 'start', ['n1', 'n2']),
  node('n1', 'decision', ['n3', 'n4']),
  node('n2', 'decision', ['n5']),
  node('n3', 'end'),
  node('n4', 'decision', ['n6', 'n7']),
  node('n5', 'end'),
  node('n6', 'end'),
  node('n7', 'decision', ['n5']),
]

// ---------------------------------------------------------------------------
// Scenes
//
//   s → sc1(scene_start) → a → sc2(scene_start) → b
//   a → s   (out of a scene, back into the preamble)
//   b → sc1 (back to an earlier scene through its entry)
//   b → a   (into an earlier scene, not via its entry)
// ---------------------------------------------------------------------------

const scenes: Adventure = [
  node('s', 'start', ['sc1']),
  node('sc1', 'scene_start', ['a']),
  node('a', 'decision', ['sc2', 's']),
  node('sc2', 'scene_start', ['b']),
  node('b', 'decision', ['sc1', 'a']),
]

// ---------------------------------------------------------------------------
// buildSceneGraph — structure
// ---------------------------------------------------------------------------

describe('buildSceneGraph — empty and single-group adventures', () => {
  it('returns no groups and no links for an empty adventure', () => {
    const graph = buildSceneGraph([])
    expect(graph.groups).toEqual([])
    expect(graph.links).toEqual([])
  })

  it('puts a lone start node in the preamble at column 0', () => {
    const graph = buildSceneGraph([node('s', 'start')])
    expect(graph.groups).toHaveLength(1)
    expect(graph.groups[0]).toMatchObject({
      key: PREAMBLE_KEY,
      kind: 'preamble',
      sceneId: null,
      rootIds: ['s'],
      nodeIds: ['s'],
      parentKey: null,
      childKeys: [],
    })
    expect(graph.column.get('s')).toBe(0)
  })

  it('lays the example diagram out as one preamble tree in breadth-first order', () => {
    const graph = buildSceneGraph(diagram)
    expect(graph.groups).toHaveLength(1)
    expect(graph.groups[0]!.nodeIds).toEqual(['start', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7'])
  })

  it('assigns columns by tree distance from the root', () => {
    const graph = buildSceneGraph(diagram)
    expect(Object.fromEntries(graph.column)).toEqual({
      start: 0, n1: 1, n2: 1, n3: 2, n4: 2, n5: 2, n6: 3, n7: 3,
    })
  })

  it('lists tree children in choice order', () => {
    const graph = buildSceneGraph(diagram)
    expect(graph.treeChildren.get('start')).toEqual(['n1', 'n2'])
    expect(graph.treeChildren.get('n1')).toEqual(['n3', 'n4'])
    expect(graph.treeChildren.get('n4')).toEqual(['n6', 'n7'])
  })

  it('keeps n5 under its home parent n2 when n7 also links to it', () => {
    const graph = buildSceneGraph(diagram)
    expect(graph.homeParent.get('n5')).toBe('n2')
    expect(graph.treeChildren.get('n2')).toEqual(['n5'])
    expect(graph.treeChildren.has('n7')).toBe(false)
  })

  it('omits leaf nodes from treeChildren', () => {
    const graph = buildSceneGraph(diagram)
    expect(graph.treeChildren.has('n3')).toBe(false)
  })
})

describe('buildSceneGraph — scenes', () => {
  it('opens a group per reachable scene_start, entry first', () => {
    const graph = buildSceneGraph(scenes)
    expect(graph.groups.map((g) => g.key)).toEqual([
      PREAMBLE_KEY, sceneKey('sc1'), sceneKey('sc2'),
    ])
    expect(graph.groups[1]).toMatchObject({
      kind: 'scene', sceneId: 'sc1', rootIds: ['sc1'], nodeIds: ['sc1', 'a'],
    })
    expect(graph.groups[2]).toMatchObject({
      kind: 'scene', sceneId: 'sc2', rootIds: ['sc2'], nodeIds: ['sc2', 'b'],
    })
  })

  it('records which group each scene is entered from', () => {
    const graph = buildSceneGraph(scenes)
    expect(graph.groups[0]!.childKeys).toEqual([sceneKey('sc1')])
    expect(graph.groups[1]!.parentKey).toBe(PREAMBLE_KEY)
    expect(graph.groups[1]!.childKeys).toEqual([sceneKey('sc2')])
    expect(graph.groups[2]!.parentKey).toBe(sceneKey('sc1'))
  })

  it('restarts columns at 0 for each scene entry', () => {
    const graph = buildSceneGraph(scenes)
    expect(graph.column.get('sc1')).toBe(0)
    expect(graph.column.get('a')).toBe(1)
    expect(graph.column.get('sc2')).toBe(0)
    expect(graph.column.get('b')).toBe(1)
  })

  it('excludes scene entries from their parent node’s treeChildren', () => {
    const graph = buildSceneGraph(scenes)
    expect(graph.treeChildren.has('s')).toBe(false)
    expect(graph.treeChildren.get('sc1')).toEqual(['a'])
    // The entry still has a home parent, used to place the scene box.
    expect(graph.homeParent.get('sc1')).toBe('s')
  })

  it('maps every node to its group', () => {
    const graph = buildSceneGraph(scenes)
    expect(Object.fromEntries(graph.groupOf)).toEqual({
      s: PREAMBLE_KEY,
      sc1: sceneKey('sc1'),
      a: sceneKey('sc1'),
      sc2: sceneKey('sc2'),
      b: sceneKey('sc2'),
    })
  })

  it('lists sibling scenes in discovery (choice) order', () => {
    const graph = buildSceneGraph([
      node('s', 'start', ['hub']),
      node('hub', 'scene_start', ['x', 'y']),
      node('y', 'scene_start'),
      node('x', 'scene_start'),
    ])
    expect(graph.groups[1]!.childKeys).toEqual([sceneKey('x'), sceneKey('y')])
  })
})

// ---------------------------------------------------------------------------
// buildSceneGraph — link classification
// ---------------------------------------------------------------------------

describe('buildSceneGraph — link classification', () => {
  it('classifies home-parent links as tree', () => {
    const graph = buildSceneGraph(diagram)
    expect(kindOf(graph, 'start', 'n1')).toBe('tree')
    expect(kindOf(graph, 'n4', 'n7', 1)).toBe('tree')
  })

  it('classifies a link to an earlier column as back (diagram: Node 7 → Node 5)', () => {
    const graph = buildSceneGraph(diagram)
    expect(kindOf(graph, 'n7', 'n5')).toBe('back')
  })

  it('classifies a link to the same column as back', () => {
    const graph = buildSceneGraph([
      node('s', 'start', ['a', 'b']),
      node('a', 'decision', ['b']),
      node('b'),
    ])
    expect(kindOf(graph, 'a', 'b')).toBe('back')
  })

  it('classifies a self-loop as back', () => {
    const graph = buildSceneGraph([node('s', 'start', ['s'])])
    expect(kindOf(graph, 's', 's')).toBe('back')
  })

  it('classifies a forward non-tree link as cross', () => {
    // c is first reached via a; b → c also goes forward a column
    const graph = buildSceneGraph([
      node('s', 'start', ['a', 'b']),
      node('a', 'decision', ['c']),
      node('b', 'decision', ['c']),
      node('c'),
    ])
    expect(kindOf(graph, 'a', 'c')).toBe('tree')
    expect(kindOf(graph, 'b', 'c')).toBe('cross')
  })

  it('treats only the first of duplicate choices to the same node as the tree link', () => {
    const graph = buildSceneGraph([node('s', 'start', ['a', 'a']), node('a')])
    expect(kindOf(graph, 's', 'a', 0)).toBe('tree')
    expect(kindOf(graph, 's', 'a', 1)).toBe('cross')
  })

  it('classifies links into a scene entry as scene', () => {
    const graph = buildSceneGraph(scenes)
    expect(kindOf(graph, 's', 'sc1')).toBe('scene')
    expect(kindOf(graph, 'a', 'sc2')).toBe('scene')
    expect(kindOf(graph, 'b', 'sc1')).toBe('scene') // back to an earlier scene
  })

  it('classifies other links between groups as scene-cross', () => {
    const graph = buildSceneGraph(scenes)
    expect(kindOf(graph, 'a', 's', 1)).toBe('scene-cross')
    expect(kindOf(graph, 'b', 'a', 1)).toBe('scene-cross')
  })

  it('skips choices whose target does not exist but keeps choice indices', () => {
    const graph = buildSceneGraph([node('s', 'start', ['ghost', 'a']), node('a')])
    expect(graph.links).toEqual([
      { from: 's', to: 'a', choiceIndex: 1, label: 'to a', kind: 'tree' },
    ])
  })

  it('carries the choice text as the link label', () => {
    const graph = buildSceneGraph(diagram)
    expect(graph.links.find((l) => l.from === 'n2')!.label).toBe('to n5')
  })
})

// ---------------------------------------------------------------------------
// buildSceneGraph — unreachable nodes
// ---------------------------------------------------------------------------

describe('buildSceneGraph — unreachable nodes', () => {
  // x ↔ y is a pure cycle; o → p → q → p is headed by an orphan.
  const withUnreachable: Adventure = [
    node('s', 'start', []),
    node('x', 'decision', ['y']),
    node('y', 'decision', ['x']),
    node('o', 'decision', ['p', 's']),
    node('p', 'decision', ['q']),
    node('q', 'decision', ['p']),
  ]

  it('collects unreachable nodes into a final group', () => {
    const graph = buildSceneGraph(withUnreachable)
    expect(graph.groups.map((g) => g.key)).toEqual([PREAMBLE_KEY, UNREACHABLE_KEY])
    expect(graph.groups[1]).toMatchObject({
      kind: 'unreachable', sceneId: null, parentKey: null, childKeys: [],
    })
  })

  it('seeds orphans before cycle members, then the cycle from its first node', () => {
    const graph = buildSceneGraph(withUnreachable)
    expect(graph.groups[1]!.rootIds).toEqual(['o', 'x'])
    expect(graph.groups[1]!.nodeIds).toEqual(['o', 'x', 'p', 'y', 'q'])
  })

  it('builds a tree inside the unreachable group', () => {
    const graph = buildSceneGraph(withUnreachable)
    expect(graph.homeParent.get('p')).toBe('o')
    expect(graph.homeParent.get('q')).toBe('p')
    expect(graph.homeParent.get('y')).toBe('x')
    expect(graph.column.get('q')).toBe(2)
    expect(kindOf(graph, 'q', 'p')).toBe('back')
    expect(kindOf(graph, 'y', 'x')).toBe('back')
  })

  it('classifies a link from an unreachable node into the preamble as scene-cross', () => {
    const graph = buildSceneGraph(withUnreachable)
    expect(kindOf(graph, 'o', 's', 1)).toBe('scene-cross')
  })

  it('does not open a scene for an unreachable scene_start', () => {
    const graph = buildSceneGraph([
      node('s', 'start'),
      node('lost', 'scene_start', ['child']),
      node('child'),
    ])
    expect(graph.groups.map((g) => g.key)).toEqual([PREAMBLE_KEY, UNREACHABLE_KEY])
    expect(graph.groupOf.get('child')).toBe(UNREACHABLE_KEY)
    expect(kindOf(graph, 'lost', 'child')).toBe('tree')
  })

  it('puts everything in the unreachable group when there is no start node', () => {
    const graph = buildSceneGraph([node('a', 'decision', ['b']), node('b')])
    expect(graph.groups.map((g) => g.key)).toEqual([UNREACHABLE_KEY])
  })
})

describe('growUnreachableForest', () => {
  it('returns no roots and adds no parents when everything is reachable', () => {
    const homeParent = new Map<string, string>()
    const roots = growUnreachableForest([node('s', 'start')], new Map([['s', 0]]), homeParent)
    expect(roots).toEqual([])
    expect(homeParent.size).toBe(0)
  })

  it('ignores links from unreachable nodes to reachable ones', () => {
    const homeParent = new Map<string, string>()
    const roots = growUnreachableForest(
      [node('s', 'start'), node('o', 'decision', ['s'])],
      new Map([['s', 0]]),
      homeParent,
    )
    expect(roots).toEqual(['o'])
    expect(homeParent.has('s')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fixtures — invariants and agreement with the classifier
// ---------------------------------------------------------------------------

describe.each([
  ['Caves_Of_Bane', caves],
  ['a_strange_day_at_the_zoo', zoo],
])('buildSceneGraph — %s fixture', (_name, doc) => {
  const graph = buildSceneGraph(doc)
  const tags = classifyAll(doc)

  it('places every node in exactly one group', () => {
    const all = graph.groups.flatMap((g) => g.nodeIds)
    expect(all).toHaveLength(doc.length)
    expect(new Set(all)).toEqual(new Set(doc.map((n) => n.id)))
    for (const group of graph.groups) {
      for (const id of group.nodeIds) expect(graph.groupOf.get(id)).toBe(group.key)
    }
  })

  it('agrees with classifier sceneId for every reachable node', () => {
    for (const group of graph.groups) {
      for (const id of group.nodeIds) {
        const tag = tags.get(id)!
        if (group.kind === 'unreachable') {
          expect(tag.unreachable).toBe(true)
        } else if (group.rootIds.includes(id) && group.kind === 'scene') {
          // A scene entry is tagged with the scene it was entered from.
          const parentGroup = graph.groups.find((g) => g.key === group.parentKey)!
          expect(tag.sceneId).toBe(parentGroup.sceneId)
        } else {
          expect(tag.sceneId).toBe(group.sceneId)
        }
      }
    }
  })

  it('agrees with classifier depth: column = depth − depth of the group root', () => {
    for (const group of graph.groups) {
      if (group.kind === 'unreachable') continue
      const rootDepth = tags.get(group.rootIds[0]!)!.depth
      for (const id of group.nodeIds) {
        expect(graph.column.get(id)).toBe(tags.get(id)!.depth - rootDepth)
      }
    }
  })

  it('has exactly one tree link per non-root node', () => {
    const roots = graph.groups.reduce((sum, g) => sum + g.rootIds.length, 0)
    const sceneEntries = graph.groups.filter((g) => g.kind === 'scene').length
    const treeLinks = graph.links.filter((l) => l.kind === 'tree').length
    // Scene entries are reached by a `scene` link, not a tree link.
    expect(treeLinks).toBe(doc.length - roots)
    expect(graph.links.filter((l) => l.kind === 'scene').length).toBeGreaterThanOrEqual(sceneEntries)
  })

  it('places every tree child one column right of its parent', () => {
    for (const [parentId, kids] of graph.treeChildren) {
      for (const kid of kids) {
        expect(graph.column.get(kid)).toBe(graph.column.get(parentId)! + 1)
      }
    }
  })

  it('is deterministic', () => {
    expect(buildSceneGraph(doc)).toEqual(graph)
  })
})

describe('buildSceneGraph — Caves_Of_Bane structure', () => {
  const graph = buildSceneGraph(caves)

  it('finds the preamble, 10 scenes and the unreachable group', () => {
    expect(graph.groups[0]!.kind).toBe('preamble')
    expect(graph.groups.filter((g) => g.kind === 'scene')).toHaveLength(10)
    expect(graph.groups.at(-1)!.kind).toBe('unreachable')
  })

  it('links between scenes almost always go through a scene entry', () => {
    const scene = graph.links.filter((l) => l.kind === 'scene').length
    const sceneCross = graph.links.filter((l) => l.kind === 'scene-cross').length
    expect(scene).toBeGreaterThan(sceneCross * 5)
  })
})
