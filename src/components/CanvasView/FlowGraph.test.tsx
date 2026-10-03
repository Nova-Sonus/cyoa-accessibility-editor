import { describe, it, expect } from 'vitest'
import { classifyAll } from '../../classifier'
import type { Adventure } from '../../types/adventure'
import { buildSceneGraph, PREAMBLE_KEY, UNREACHABLE_KEY, sceneKey } from './sceneGraph'
import type { SceneGroup } from './sceneGraph'
import type { RoutedLink } from './linkRouting'
import { sceneTitle, sceneSummary, linkStyle, computeSpotlightState } from './FlowGraph'

function node(
  id: string,
  type: Adventure[number]['node_type'] = 'decision',
  targets: string[] = [],
  extra: Partial<Adventure[number]> = {},
): Adventure[number] {
  return {
    id,
    title: `Title ${id}`,
    node_type: type,
    narrativeText: '',
    choices: targets.map((nextNode) => ({ choiceText: '', choiceResponseConstraint: '', nextNode })),
    ...extra,
  }
}

const doc: Adventure = [
  node('s', 'start', ['sc']),
  node('sc', 'scene_start', ['a', 'b']),
  node('a', 'end', [], { checkpoint: true }),
  node('b', 'end'),
  node('lost'),
]
const graph = buildSceneGraph(doc)
const byId = new Map(doc.map((n) => [n.id, n]))
const group = (key: string) => graph.groups.find((g) => g.key === key)!

describe('sceneTitle', () => {
  it('names the opening, the unlinked group and scenes by their entry node', () => {
    expect(sceneTitle(group(PREAMBLE_KEY), byId)).toBe('Opening')
    expect(sceneTitle(group(UNREACHABLE_KEY), byId)).toBe('Unlinked nodes')
    expect(sceneTitle(group(sceneKey('sc')), byId)).toBe('Title sc')
  })

  it('falls back to the scene id when the entry node is missing', () => {
    expect(sceneTitle(group(sceneKey('sc')), new Map())).toBe('sc')
  })
})

describe('sceneSummary', () => {
  const cache = classifyAll(doc)

  it('counts nodes, checkpoints and endings with correct plurals', () => {
    expect(sceneSummary(group(sceneKey('sc')), cache)).toBe('3 nodes · 1 checkpoint · 2 endings')
  })

  it('omits zero checkpoint and ending counts', () => {
    expect(sceneSummary(group(PREAMBLE_KEY), cache)).toBe('1 node')
  })

  it('tolerates nodes missing from the classifier cache', () => {
    const empty: SceneGroup = { ...group(PREAMBLE_KEY), nodeIds: ['ghost'] }
    expect(sceneSummary(empty, new Map())).toBe('1 node')
  })
})

describe('linkStyle', () => {
  const link = (kind: RoutedLink['kind'], isBack = false) => ({ kind, isBack }) as RoutedLink

  it('draws every loop-back in the back style', () => {
    expect(linkStyle(link('back', true))).toBe('back')
    expect(linkStyle(link('scene', true))).toBe('back')
  })

  it('maps the remaining kinds to tree, cross and scene', () => {
    expect(linkStyle(link('tree'))).toBe('tree')
    expect(linkStyle(link('cross'))).toBe('cross')
    expect(linkStyle(link('scene'))).toBe('scene')
    expect(linkStyle(link('scene-cross'))).toBe('scene')
  })
})

describe('computeSpotlightState', () => {
  const lit = new Set(['f', 'n'])

  it('is normal with no spotlight', () => {
    expect(computeSpotlightState('x', null, null)).toBe('normal')
  })

  it('distinguishes the focus, its neighbours and everything else', () => {
    expect(computeSpotlightState('f', 'f', lit)).toBe('focus')
    expect(computeSpotlightState('n', 'f', lit)).toBe('neighbour')
    expect(computeSpotlightState('x', 'f', lit)).toBe('dimmed')
  })
})
