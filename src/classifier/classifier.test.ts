import { describe, it, expect, beforeAll } from 'vitest'
import type { Adventure } from '../types/adventure'
import {
  buildNodeMap,
  buildInDegreeMap,
  bfsFromStarts,
  classifyAll,
  classifyNode,
} from './classifier'
import AStrangeDayAtTheZoo from '../../fixtures/a_strange_day_at_the_zoo.json'
import CavesOfBane from '../../fixtures/Caves_Of_Bane.json'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid adventure node factory. */
function node(
  id: string,
  node_type: Adventure[number]['node_type'] = 'decision',
  choices: Array<{ nextNode: string }> = [],
  extra: Partial<Adventure[number]> = {},
): Adventure[number] {
  return {
    id,
    title: id,
    node_type,
    narrativeText: '',
    choices: choices.map((c) => ({
      choiceText: '',
      choiceResponseConstraint: '',
      nextNode: c.nextNode,
    })),
    ...extra,
  }
}

// ---------------------------------------------------------------------------
// buildNodeMap
// ---------------------------------------------------------------------------

describe('buildNodeMap', () => {
  it('returns an empty map for an empty graph', () => {
    expect(buildNodeMap([])).toEqual(new Map())
  })

  it('maps each node id to its node object', () => {
    const graph: Adventure = [node('a'), node('b')]
    const map = buildNodeMap(graph)
    expect(map.size).toBe(2)
    expect(map.get('a')).toBe(graph[0])
    expect(map.get('b')).toBe(graph[1])
  })

  it('last occurrence wins for duplicate ids', () => {
    const first = node('a')
    const second = { ...node('a'), title: 'second' }
    const map = buildNodeMap([first, second] as Adventure)
    expect(map.get('a')).toBe(second)
  })
})

// ---------------------------------------------------------------------------
// buildInDegreeMap
// ---------------------------------------------------------------------------

describe('buildInDegreeMap', () => {
  it('gives every node an in-degree of 0 when there are no choices', () => {
    const graph: Adventure = [node('a'), node('b')]
    const nodeMap = buildNodeMap(graph)
    const deg = buildInDegreeMap(graph, nodeMap)
    expect(deg.get('a')).toBe(0)
    expect(deg.get('b')).toBe(0)
  })

  it('increments the target node in-degree for each incoming edge', () => {
    const graph: Adventure = [
      node('start', 'start', [{ nextNode: 'b' }, { nextNode: 'c' }]),
      node('b', 'decision', [{ nextNode: 'c' }]),
      node('c'),
    ]
    const nodeMap = buildNodeMap(graph)
    const deg = buildInDegreeMap(graph, nodeMap)
    expect(deg.get('start')).toBe(0)
    expect(deg.get('b')).toBe(1)
    expect(deg.get('c')).toBe(2) // pointed to by start and b
  })

  it('ignores choice edges that reference ids not present in the graph', () => {
    const graph: Adventure = [node('a', 'start', [{ nextNode: 'ghost' }])]
    const nodeMap = buildNodeMap(graph)
    const deg = buildInDegreeMap(graph, nodeMap)
    expect(deg.get('a')).toBe(0)
    expect(deg.has('ghost')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// bfsFromStarts
// ---------------------------------------------------------------------------

describe('bfsFromStarts', () => {
  it('returns empty maps for an empty graph', () => {
    const result = bfsFromStarts([], new Map())
    expect(result.depth.size).toBe(0)
    expect(result.sceneId.size).toBe(0)
  })

  it('sets depth 0 for start nodes', () => {
    const graph: Adventure = [node('s', 'start')]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.get('s')).toBe(0)
  })

  it('does not set depth for unreachable nodes', () => {
    const graph: Adventure = [node('s', 'start'), node('orphan')]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.has('orphan')).toBe(false)
  })

  it('assigns correct depths via BFS', () => {
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'a' }]),
      node('a', 'decision', [{ nextNode: 'b' }]),
      node('b', 'decision', [{ nextNode: 'c' }]),
      node('c'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.get('s')).toBe(0)
    expect(depth.get('a')).toBe(1)
    expect(depth.get('b')).toBe(2)
    expect(depth.get('c')).toBe(3)
  })

  it('handles multiple start nodes as multi-source BFS', () => {
    const graph: Adventure = [
      node('s1', 'start', [{ nextNode: 'a' }]),
      node('s2', 'start', [{ nextNode: 'b' }]),
      node('a'),
      node('b'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.get('s1')).toBe(0)
    expect(depth.get('s2')).toBe(0)
    expect(depth.get('a')).toBe(1)
    expect(depth.get('b')).toBe(1)
  })

  it('does not revisit nodes — first (shortest) path wins for depth', () => {
    // s → a (depth 1) via direct edge
    // s → x → a (depth 2 via x)  — a should stay at depth 1
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'a' }, { nextNode: 'x' }]),
      node('x', 'decision', [{ nextNode: 'a' }]),
      node('a'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.get('a')).toBe(1)
  })

  it('ignores choice edges whose nextNode is not present in nodeMap', () => {
    const graph: Adventure = [node('s', 'start', [{ nextNode: 'ghost' }])]
    const nodeMap = buildNodeMap(graph)
    // 'ghost' is not in nodeMap — bfsFromStarts should skip it gracefully
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.has('ghost')).toBe(false)
    expect(depth.get('s')).toBe(0)
  })

  it('does not infinite-loop on cycles', () => {
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'a' }]),
      node('a', 'decision', [{ nextNode: 'b' }]),
      node('b', 'decision', [{ nextNode: 'a' }]), // cycle a ↔ b
    ]
    const nodeMap = buildNodeMap(graph)
    const { depth } = bfsFromStarts(graph, nodeMap)
    expect(depth.get('a')).toBe(1)
    expect(depth.get('b')).toBe(2)
  })

  it('propagates null sceneId when no scene_start has been encountered', () => {
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'a' }]),
      node('a', 'decision', [{ nextNode: 'b' }]),
      node('b'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { sceneId } = bfsFromStarts(graph, nodeMap)
    expect(sceneId.get('s')).toBe(null)
    expect(sceneId.get('a')).toBe(null)
    expect(sceneId.get('b')).toBe(null)
  })

  it('sets sceneId to the scene_start node id for its children', () => {
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'sc' }]),
      node('sc', 'scene_start', [{ nextNode: 'a' }]),
      node('a', 'decision', [{ nextNode: 'b' }]),
      node('b'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { sceneId } = bfsFromStarts(graph, nodeMap)
    // sc itself inherits null from its parent (s)
    expect(sceneId.get('sc')).toBe(null)
    // children of sc inherit "sc"
    expect(sceneId.get('a')).toBe('sc')
    expect(sceneId.get('b')).toBe('sc')
  })

  it('updates sceneId when a nested scene_start is encountered', () => {
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'sc1' }]),
      node('sc1', 'scene_start', [{ nextNode: 'sc2' }]),
      node('sc2', 'scene_start', [{ nextNode: 'a' }]),
      node('a'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { sceneId } = bfsFromStarts(graph, nodeMap)
    expect(sceneId.get('sc1')).toBe(null) // inherits from s
    expect(sceneId.get('sc2')).toBe('sc1') // inherits from sc1 (sc1 is its parent)
    expect(sceneId.get('a')).toBe('sc2') // inherits from sc2
  })

  it('first BFS visit wins for sceneId when a node is reachable via multiple paths', () => {
    // s → sc1 → junction
    // s → sc2 → junction
    // zoo-004-like scenario: junction gets sceneId of whichever branch is visited first
    const graph: Adventure = [
      node('s', 'start', [{ nextNode: 'sc1' }, { nextNode: 'sc2' }]),
      node('sc1', 'scene_start', [{ nextNode: 'junction' }]),
      node('sc2', 'scene_start', [{ nextNode: 'junction' }]),
      node('junction'),
    ]
    const nodeMap = buildNodeMap(graph)
    const { sceneId } = bfsFromStarts(graph, nodeMap)
    // sc1 is enqueued before sc2, so junction is first reached via sc1
    expect(sceneId.get('junction')).toBe('sc1')
  })
})

// ---------------------------------------------------------------------------
// classifyAll — tag correctness
// ---------------------------------------------------------------------------

describe('classifyAll', () => {
  it('returns an empty map for an empty graph', () => {
    expect(classifyAll([])).toEqual(new Map())
  })

  describe('isOrphan', () => {
    it('start node is NOT an orphan even when nothing points to it', () => {
      const graph: Adventure = [node('s', 'start')]
      expect(classifyAll(graph).get('s')!.isOrphan).toBe(false)
    })

    it('non-start node with no incoming edges IS an orphan', () => {
      const graph: Adventure = [node('s', 'start'), node('detached')]
      expect(classifyAll(graph).get('detached')!.isOrphan).toBe(true)
    })

    it('non-start node that is pointed to by another node is NOT an orphan', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('a')!.isOrphan).toBe(false)
    })

    it('start node that is also pointed to by another node is NOT an orphan', () => {
      // Unusual but valid: something links back to start
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a', 'decision', [{ nextNode: 's' }]),
      ]
      expect(classifyAll(graph).get('s')!.isOrphan).toBe(false)
    })
  })

  describe('isTerminal', () => {
    it('end node is terminal', () => {
      const graph: Adventure = [node('s', 'start'), node('e', 'end')]
      expect(classifyAll(graph).get('e')!.isTerminal).toBe(true)
    })

    it('adventure_success node is terminal', () => {
      const graph: Adventure = [
        node('s', 'start'),
        node('w', 'adventure_success'),
      ]
      expect(classifyAll(graph).get('w')!.isTerminal).toBe(true)
    })

    it('non-terminal node types are not terminal', () => {
      const types: Array<Adventure[number]['node_type']> = [
        'start',
        'decision',
        'scene_start',
        'narrative',
        'combat',
        'puzzle',
      ]
      const graph = types.map((t) => node(t, t)) as Adventure
      const all = classifyAll(graph)
      for (const t of types) {
        expect(all.get(t)!.isTerminal).toBe(false)
      }
    })
  })

  describe('isJunction', () => {
    it('node with in-degree < 2 is NOT a junction', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('a')!.isJunction).toBe(false)
    })

    it('node with in-degree ≥ 2 IS a junction', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }, { nextNode: 'b' }]),
        node('a', 'decision', [{ nextNode: 'c' }]),
        node('b', 'decision', [{ nextNode: 'c' }]),
        node('c'),
      ]
      expect(classifyAll(graph).get('c')!.isJunction).toBe(true)
    })
  })

  describe('isBranch', () => {
    it('node with 0 choices is NOT a branch', () => {
      const graph: Adventure = [node('s', 'start'), node('e', 'end')]
      expect(classifyAll(graph).get('e')!.isBranch).toBe(false)
    })

    it('node with 1 choice is NOT a branch', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('s')!.isBranch).toBe(false)
    })

    it('node with 2 choices IS a branch', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }, { nextNode: 'b' }]),
        node('a'),
        node('b'),
      ]
      expect(classifyAll(graph).get('s')!.isBranch).toBe(true)
    })

    it('node with 3 choices IS a branch', () => {
      const graph: Adventure = [
        node('s', 'start', [
          { nextNode: 'a' },
          { nextNode: 'b' },
          { nextNode: 'c' },
        ]),
        node('a'),
        node('b'),
        node('c'),
      ]
      expect(classifyAll(graph).get('s')!.isBranch).toBe(true)
    })
  })

  describe('isLinearLink', () => {
    it('node with 0 choices is NOT a linear link', () => {
      const graph: Adventure = [node('s', 'start'), node('e', 'end')]
      expect(classifyAll(graph).get('e')!.isLinearLink).toBe(false)
    })

    it('node with exactly 1 choice IS a linear link', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('s')!.isLinearLink).toBe(true)
    })

    it('node with 2 choices is NOT a linear link', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }, { nextNode: 'b' }]),
        node('a'),
        node('b'),
      ]
      expect(classifyAll(graph).get('s')!.isLinearLink).toBe(false)
    })

    it('isBranch and isLinearLink are mutually exclusive for nodes with choices', () => {
      const graph: Adventure = [
        node('link', 'decision', [{ nextNode: 'x' }]),
        node('branch', 'decision', [{ nextNode: 'x' }, { nextNode: 'y' }]),
        node('x'),
        node('y'),
      ]
      const all = classifyAll(graph)
      expect(all.get('link')!.isBranch).toBe(false)
      expect(all.get('link')!.isLinearLink).toBe(true)
      expect(all.get('branch')!.isBranch).toBe(true)
      expect(all.get('branch')!.isLinearLink).toBe(false)
    })
  })

  describe('isCheckpoint', () => {
    it('node with checkpoint true IS a checkpoint', () => {
      const graph: Adventure = [node('a', 'decision', [], { checkpoint: true })]
      expect(classifyAll(graph).get('a')!.isCheckpoint).toBe(true)
    })

    it('node with checkpoint false is NOT a checkpoint', () => {
      const graph: Adventure = [
        node('a', 'decision', [], { checkpoint: false }),
      ]
      expect(classifyAll(graph).get('a')!.isCheckpoint).toBe(false)
    })

    it('node without a checkpoint field is NOT a checkpoint', () => {
      const graph: Adventure = [node('a')]
      expect(classifyAll(graph).get('a')!.isCheckpoint).toBe(false)
    })
  })

  describe('depth', () => {
    it('start node has depth 0', () => {
      const graph: Adventure = [node('s', 'start')]
      expect(classifyAll(graph).get('s')!.depth).toBe(0)
    })

    it('unreachable node has depth Infinity', () => {
      const graph: Adventure = [node('s', 'start'), node('orphan')]
      expect(classifyAll(graph).get('orphan')!.depth).toBe(Infinity)
    })

    it('assigns correct BFS depths along a chain', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a', 'decision', [{ nextNode: 'b' }]),
        node('b', 'end'),
      ]
      const all = classifyAll(graph)
      expect(all.get('s')!.depth).toBe(0)
      expect(all.get('a')!.depth).toBe(1)
      expect(all.get('b')!.depth).toBe(2)
    })

    it('assigns depth via shortest path for diamond-shaped graph', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }, { nextNode: 'b' }]),
        node('a', 'decision', [{ nextNode: 'c' }]),
        node('b', 'decision', [{ nextNode: 'c' }]),
        node('c', 'end'),
      ]
      const all = classifyAll(graph)
      expect(all.get('c')!.depth).toBe(2)
    })
  })

  describe('unreachable', () => {
    it('start node is reachable', () => {
      const graph: Adventure = [node('s', 'start')]
      expect(classifyAll(graph).get('s')!.unreachable).toBe(false)
    })

    it('node reachable from start is not unreachable', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('a')!.unreachable).toBe(false)
    })

    it('node with no path from start is unreachable', () => {
      const graph: Adventure = [node('s', 'start'), node('island')]
      expect(classifyAll(graph).get('island')!.unreachable).toBe(true)
    })

    it('node reachable only from an unreachable node is itself unreachable', () => {
      // island → chain — both should be unreachable
      const graph: Adventure = [
        node('s', 'start'),
        node('island', 'decision', [{ nextNode: 'chain' }]),
        node('chain'),
      ]
      const all = classifyAll(graph)
      expect(all.get('island')!.unreachable).toBe(true)
      expect(all.get('chain')!.unreachable).toBe(true)
    })
  })

  describe('sceneId', () => {
    it('is null for start node', () => {
      const graph: Adventure = [node('s', 'start')]
      expect(classifyAll(graph).get('s')!.sceneId).toBe(null)
    })

    it('is null when no scene_start ancestor exists', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('a')!.sceneId).toBe(null)
    })

    it('is null for the scene_start node itself (inherits from parent)', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'sc' }]),
        node('sc', 'scene_start'),
      ]
      expect(classifyAll(graph).get('sc')!.sceneId).toBe(null)
    })

    it("is the scene_start node's id for direct children", () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'sc' }]),
        node('sc', 'scene_start', [{ nextNode: 'a' }]),
        node('a'),
      ]
      expect(classifyAll(graph).get('a')!.sceneId).toBe('sc')
    })

    it('propagates through multiple hops within the same scene', () => {
      const graph: Adventure = [
        node('s', 'start', [{ nextNode: 'sc' }]),
        node('sc', 'scene_start', [{ nextNode: 'a' }]),
        node('a', 'decision', [{ nextNode: 'b' }]),
        node('b'),
      ]
      expect(classifyAll(graph).get('b')!.sceneId).toBe('sc')
    })

    it('is null for unreachable nodes', () => {
      const graph: Adventure = [
        node('s', 'start'),
        node('sc', 'scene_start', [{ nextNode: 'orphan' }]),
        node('orphan'),
      ]
      expect(classifyAll(graph).get('sc')!.sceneId).toBe(null)
      expect(classifyAll(graph).get('orphan')!.sceneId).toBe(null)
    })
  })
})

// ---------------------------------------------------------------------------
// classifyNode
// ---------------------------------------------------------------------------

describe('classifyNode', () => {
  it('returns the same tags as classifyAll for the requested node', () => {
    const graph = AStrangeDayAtTheZoo as unknown as Adventure
    const all = classifyAll(graph)
    for (const node of graph) {
      expect(classifyNode(graph, node.id)).toEqual(all.get(node.id))
    }
  })

  it('throws when the requested node id is not in the graph', () => {
    const graph: Adventure = [node('s', 'start')]
    expect(() => classifyNode(graph, 'ghost')).toThrow(
      'classifyNode: node "ghost" not found in graph',
    )
  })
})

// ---------------------------------------------------------------------------
// Fixture: a_strange_day_at_the_zoo — full expected tags
// ---------------------------------------------------------------------------

describe('classifyAll — a_strange_day_at_the_zoo fixture', () => {
  const graph = AStrangeDayAtTheZoo as unknown as Adventure
  let all: ReturnType<typeof classifyAll>

  beforeAll(() => {
    all = classifyAll(graph)
  })

  it('zoo-001 (start, 2 choices, no checkpoint)', () => {
    expect(all.get('zoo-001')).toEqual({
      isOrphan: false,
      isTerminal: false,
      isJunction: false,
      isBranch: true,
      isLinearLink: false,
      isCheckpoint: false,
      sceneId: null,
      depth: 0,
      unreachable: false,
    } satisfies import('./types').ClassifierTags)
  })

  it('zoo-002 (scene_start, 1 choice, checkpoint)', () => {
    expect(all.get('zoo-002')).toEqual({
      isOrphan: false,
      isTerminal: false,
      isJunction: false,
      isBranch: false,
      isLinearLink: true,
      isCheckpoint: true,
      sceneId: null, // scene_start inherits from its parent (zoo-001 has no scene)
      depth: 1,
      unreachable: false,
    } satisfies import('./types').ClassifierTags)
  })

  it('zoo-003 (scene_start, 1 choice, checkpoint)', () => {
    expect(all.get('zoo-003')).toEqual({
      isOrphan: false,
      isTerminal: false,
      isJunction: false,
      isBranch: false,
      isLinearLink: true,
      isCheckpoint: true,
      sceneId: null,
      depth: 1,
      unreachable: false,
    } satisfies import('./types').ClassifierTags)
  })

  it('zoo-004 (adventure_success, 0 choices, junction — pointed to by zoo-002 and zoo-003)', () => {
    expect(all.get('zoo-004')).toEqual({
      isOrphan: false,
      isTerminal: true,
      isJunction: true,
      isBranch: false,
      isLinearLink: false,
      isCheckpoint: false,
      sceneId: 'zoo-002', // first BFS path via zoo-002 wins
      depth: 2,
      unreachable: false,
    } satisfies import('./types').ClassifierTags)
  })
})

// ---------------------------------------------------------------------------
// Fixture: Caves_Of_Bane — spot-checks on a large, real-world adventure
// ---------------------------------------------------------------------------

describe('classifyAll — Caves_Of_Bane fixture spot-checks', () => {
  // Caves_Of_Bane contains a known choiceResponseConstaint typo; cast through
  // unknown to bypass TypeScript's structural checks (same as InMemoryRepository tests).
  const graph = CavesOfBane as unknown as Adventure
  let all: ReturnType<typeof classifyAll>

  beforeAll(() => {
    all = classifyAll(graph)
  })

  it('produces a tag entry for every node in the graph', () => {
    expect(all.size).toBe(graph.length)
  })

  it('node "001" is the start node — depth 0, not orphan, not unreachable', () => {
    const tags = all.get('001')!
    expect(tags.depth).toBe(0)
    expect(tags.isOrphan).toBe(false)
    expect(tags.unreachable).toBe(false)
  })

  it('start node "001" is a branch (has 2 choices)', () => {
    expect(all.get('001')!.isBranch).toBe(true)
    expect(all.get('001')!.isLinearLink).toBe(false)
  })

  it('no node has both isBranch and isLinearLink set to true', () => {
    for (const [, tags] of all) {
      expect(tags.isBranch && tags.isLinearLink).toBe(false)
    }
  })

  it('no node has both isOrphan and isJunction set to true', () => {
    // An orphan has in-degree 0; a junction needs in-degree ≥ 2 — impossible simultaneously.
    for (const [, tags] of all) {
      expect(tags.isOrphan && tags.isJunction).toBe(false)
    }
  })

  it('all terminal nodes have isBranch=false and isLinearLink=false', () => {
    for (const [, tags] of all) {
      if (tags.isTerminal) {
        expect(tags.isBranch).toBe(false)
        expect(tags.isLinearLink).toBe(false)
      }
    }
  })

  it('unreachable nodes have depth Infinity', () => {
    for (const [, tags] of all) {
      if (tags.unreachable) {
        expect(tags.depth).toBe(Infinity)
      }
    }
  })

  it('all reachable nodes have finite depth', () => {
    for (const [, tags] of all) {
      if (!tags.unreachable) {
        expect(tags.depth).not.toBe(Infinity)
      }
    }
  })

  it('checkpoint nodes have isCheckpoint=true', () => {
    const checkpointNodes = graph.filter((n) => n.checkpoint === true)
    expect(checkpointNodes.length).toBeGreaterThan(0)
    for (const n of checkpointNodes) {
      expect(all.get(n.id)!.isCheckpoint).toBe(true)
    }
  })
})
