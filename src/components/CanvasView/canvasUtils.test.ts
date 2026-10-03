import { describe, it, expect } from 'vitest'
import { classifyAll } from '../../classifier'
import type { Adventure } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'
import cavesFixture from '../../../fixtures/Caves_Of_Bane.json'
import zooFixture from '../../../fixtures/a_strange_day_at_the_zoo.json'
import {
  getNeighbours,
  getInterSceneEdges,
} from './canvasUtils'

// ---------------------------------------------------------------------------
// Typed fixture imports
// ---------------------------------------------------------------------------

const caves = cavesFixture as Adventure
const zoo = zooFixture as Adventure

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChoiceSpec = { choiceText: string; choiceResponseConstraint: string; nextNode: string }

function node(
  id: string,
  type: Adventure[number]['node_type'],
  choices: ChoiceSpec[],
  title = id,
): Adventure[number] {
  return { id, title, node_type: type, narrativeText: '', choices }
}

function ch(nextNode: string, choiceText = `go to ${nextNode}`): ChoiceSpec {
  return { choiceText, choiceResponseConstraint: 'none', nextNode }
}

// ---------------------------------------------------------------------------
// Synthetic adventure
//
// Topology:
//   start → preamble → sceneB(scene_start) → nodeC → sceneD(scene_start) → nodeE, nodeF
//   nodeC also → start (back to null-scene)
//   nodeE also → nodeC (back-edge sceneD→sceneB), nodeF, start (null outbound)
//   orphan(unreachable) → nodeC, nodeE
//
// BFS result:
//   start: depth=0, sceneId=null
//   preamble: depth=1, sceneId=null
//   sceneB: depth=2, sceneId=null  (scene_start inherits from preamble)
//   nodeC: depth=3, sceneId='sceneB'
//   sceneD: depth=4, sceneId='sceneB'  (scene_start inherits from nodeC)
//   nodeE: depth=5, sceneId='sceneD'
//   nodeF: depth=5, sceneId='sceneD'
//   orphan: depth=Infinity, sceneId=null
// ---------------------------------------------------------------------------

const mini: Adventure = [
  node('start', 'start', [ch('preamble')]),
  node('preamble', 'decision', [ch('sceneB')]),
  node('sceneB', 'scene_start', [ch('nodeC')]),
  node('nodeC', 'decision', [ch('sceneD'), ch('start')]),
  node('sceneD', 'scene_start', [ch('nodeE'), ch('nodeF')]),
  node('nodeE', 'decision', [ch('nodeC'), ch('nodeF'), ch('start')]),
  node('nodeF', 'end', []),
  node('orphan', 'decision', [ch('nodeC'), ch('nodeE')]),
]

const miniCache = classifyAll(mini)

// ---------------------------------------------------------------------------
// describe('getNeighbours')
// ---------------------------------------------------------------------------

describe('getNeighbours', () => {
  it('returns children from the target node\'s own choices', () => {
    const result = getNeighbours(mini, 'nodeC')
    expect(result.children).toEqual(new Set(['sceneD', 'start']))
  })

  it('returns parents from all nodes whose choices reference the target', () => {
    const result = getNeighbours(mini, 'nodeC')
    expect(result.parents).toEqual(new Set(['sceneB', 'nodeE', 'orphan']))
  })

  it('returns all as the union of parents and children', () => {
    const result = getNeighbours(mini, 'nodeC')
    expect(result.all).toEqual(new Set(['sceneB', 'nodeE', 'orphan', 'sceneD', 'start']))
  })

  it('returns only parents when the node has no choices (terminal)', () => {
    const result = getNeighbours(mini, 'nodeF')
    expect(result.children).toEqual(new Set())
    expect(result.parents).toEqual(new Set(['sceneD', 'nodeE']))
  })

  it('returns only children for an unreferenced start node', () => {
    // preamble is the start node's only child; no node in mini points to preamble
    const result = getNeighbours(mini, 'preamble')
    expect(result.children).toEqual(new Set(['sceneB']))
    expect(result.parents).toEqual(new Set(['start']))
  })

  it('returns empty sets for a nodeId not referenced by any choice', () => {
    const result = getNeighbours(mini, 'totally-unknown')
    expect(result.children).toEqual(new Set())
    expect(result.parents).toEqual(new Set())
    expect(result.all).toEqual(new Set())
  })

  it('handles a self-loop (node points to itself)', () => {
    const selfLoop: Adventure = [node('A', 'start', [ch('A')])]
    const result = getNeighbours(selfLoop, 'A')
    expect(result.children).toEqual(new Set(['A']))
    expect(result.parents).toEqual(new Set(['A']))
    expect(result.all).toEqual(new Set(['A']))
  })

  it('zoo — start node has two children and no parents', () => {
    const { parents, children } = getNeighbours(zoo, 'zoo-001')
    expect(parents.size).toBe(0)
    expect(children).toEqual(new Set(['zoo-002', 'zoo-003']))
  })

  it('zoo — terminal node has two parents and no children', () => {
    const { parents, children } = getNeighbours(zoo, 'zoo-004')
    expect(parents).toEqual(new Set(['zoo-002', 'zoo-003']))
    expect(children.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// describe('getInterSceneEdges')
// ---------------------------------------------------------------------------

describe('getInterSceneEdges', () => {
  it('returns an empty array for an empty adventure', () => {
    expect(getInterSceneEdges([], new Map())).toEqual([])
  })

  it('returns empty when no node has a sceneId (all null)', () => {
    // Zoo has no nodes with non-null sceneId on the "source" side of any edge
    const zooCache = classifyAll(zoo)
    expect(getInterSceneEdges(zoo, zooCache)).toEqual([])
  })

  it('includes only edges that cross scene boundaries', () => {
    const edges = getInterSceneEdges(mini, miniCache)
    const ids = edges.map(e => `${e.from}→${e.to}`)
    // nodeC→sceneD is intra-scene (both sceneId='sceneB') — must not appear
    expect(ids).not.toContain('nodeC→sceneD')
  })

  it('returns forward inter-scene edges with isBack=false', () => {
    const edges = getInterSceneEdges(mini, miniCache)
    const forward = edges.filter(e => !e.isBack)
    expect(forward.length).toBeGreaterThan(0)
    // sceneD (sceneId='sceneB') → nodeE/nodeF (sceneId='sceneD')
    const toNodeE = forward.find(e => e.from === 'sceneD' && e.to === 'nodeE')
    expect(toNodeE).toBeDefined()
    expect(toNodeE!.fromScene).toBe('sceneB')
    expect(toNodeE!.toScene).toBe('sceneD')
    expect(toNodeE!.isBack).toBe(false)
  })

  it('returns back-edges with isBack=true when target scene depth ≤ source scene depth', () => {
    const edges = getInterSceneEdges(mini, miniCache)
    const back = edges.find(e => e.from === 'nodeE' && e.to === 'nodeC')
    expect(back).toBeDefined()
    expect(back!.fromScene).toBe('sceneD')
    expect(back!.toScene).toBe('sceneB')
    expect(back!.isBack).toBe(true)
  })

  it('populates the label from the choice text', () => {
    const edges = getInterSceneEdges(mini, miniCache)
    const edge = edges.find(e => e.from === 'nodeE' && e.to === 'nodeC')
    expect(edge!.label).toBe('go to nodeC')
  })

  it('skips edges where choice.nextNode is not in the classifierCache (dangling ref)', () => {
    const withDangling: Adventure = [
      node('S', 'start', [ch('SC')]),
      node('SC', 'scene_start', [ch('I')]),
      node('I', 'decision', [ch('DOES_NOT_EXIST')]),
    ]
    const cache = classifyAll(withDangling)
    // I.sceneId='SC'; DOES_NOT_EXIST not in cache → toScene=null → skipped
    const edges = getInterSceneEdges(withDangling, cache)
    expect(edges.every(e => e.to !== 'DOES_NOT_EXIST')).toBe(true)
  })

  it('falls back to Infinity when fromScene is absent from the cache (isBack=true)', () => {
    // Build a cache where a node's sceneId points to a scene node not present in the cache.
    // classifierCache.get(fromScene)?.depth is undefined → ?? Infinity fires.
    const tags = (sceneId: string | null, depth: number): ClassifierTags => ({
      isOrphan: false, isTerminal: false, isJunction: false, isBranch: false,
      isLinearLink: true, isCheckpoint: false, sceneId, depth, unreachable: false,
    })
    const customCache = new Map([
      ['I', tags('missing', 5)],   // fromScene='missing', NOT in cache → depth=Infinity
      ['J', tags('other', 3)],     // toScene='other', depth=3
      ['other', tags(null, 2)],    // depth of 'other' scene node = 2
      // 'missing' intentionally absent → cache.get('missing')?.depth = undefined → ?? Infinity
    ])
    const adventure: Adventure = [node('I', 'decision', [ch('J')])]
    const edges = getInterSceneEdges(adventure, customCache)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.isBack).toBe(true) // 2 (other.depth) <= Infinity = true
  })

  it('falls back to Infinity when toScene is absent from the cache (isBack=false)', () => {
    const tags = (sceneId: string | null, depth: number): ClassifierTags => ({
      isOrphan: false, isTerminal: false, isJunction: false, isBranch: false,
      isLinearLink: true, isCheckpoint: false, sceneId, depth, unreachable: false,
    })
    const customCache = new Map([
      ['I', tags('known', 5)],    // fromScene='known', depth=1
      ['J', tags('missing', 8)],  // toScene='missing', NOT in cache → depth=Infinity
      ['known', tags(null, 1)],   // depth of 'known' scene node = 1
      // 'missing' intentionally absent → cache.get('missing')?.depth = undefined → ?? Infinity
    ])
    const adventure: Adventure = [node('I', 'decision', [ch('J')])]
    const edges = getInterSceneEdges(adventure, customCache)
    expect(edges).toHaveLength(1)
    expect(edges[0]!.isBack).toBe(false) // Infinity (missing) <= 1 (known) = false
  })

  it('Caves — returns a non-empty set of inter-scene edges', () => {
    const cavesCache = classifyAll(caves)
    const edges = getInterSceneEdges(caves, cavesCache)
    expect(edges.length).toBeGreaterThan(0)
    // Every edge must have non-null, distinct fromScene / toScene
    for (const edge of edges) {
      expect(edge.fromScene).not.toBeNull()
      expect(edge.toScene).not.toBeNull()
      expect(edge.fromScene).not.toBe(edge.toScene)
      expect(typeof edge.isBack).toBe('boolean')
    }
  })
})

