import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { CanvasView } from './CanvasView'
import { AdventureStoreProvider } from '../../store/StoreContext'
import { createAdventureStore } from '../../store/adventureStore'
import { InMemoryRepository } from '../../repository/InMemoryRepository'
import type { AdventureNode } from '../../types/adventure'
import { computeLayout, edgePath } from './useCanvasLayout'
import { classifyAll } from '../../classifier'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

function makeChoice(nextNode: string, choiceText = 'Go there') {
  return { choiceText, choiceResponseConstraint: '', nextNode }
}

async function makeStoreWithNodes(nodes: AdventureNode[]) {
  const repo = new InMemoryRepository()
  await repo.save('test', nodes)
  const store = createAdventureStore(repo)
  await store.getState().loadAdventure('test')
  return store
}

type Store = Awaited<ReturnType<typeof makeStoreWithNodes>>

function renderCanvas(store: Store, onNodeActivate = vi.fn()) {
  return render(
    <AdventureStoreProvider store={store}>
      <CanvasView onNodeActivate={onNodeActivate} />
    </AdventureStoreProvider>,
  )
}

// Simple 3-node adventure: start → scene_start → narrative
// preamble (sceneId=null): [start1, scene1]
// sceneMap: { 'scene1': [node1] }
function makeSimpleDoc() {
  return [
    makeNode('start1', { node_type: 'start', choices: [makeChoice('scene1', 'Enter')] }),
    makeNode('scene1', { node_type: 'scene_start', choices: [makeChoice('node1')] }),
    makeNode('node1', { node_type: 'narrative' }),
  ]
}

// ---------------------------------------------------------------------------
// computeLayout — pure unit tests
// ---------------------------------------------------------------------------

describe('computeLayout', () => {
  it('returns empty layout for empty document', () => {
    const layout = computeLayout([], new Map())
    expect(layout.nodes).toHaveLength(0)
    expect(layout.edges).toHaveLength(0)
    expect(layout.totalWidth).toBe(0)
    expect(layout.totalHeight).toBe(0)
  })

  it('places a single start node at depth 0', () => {
    const doc = [makeNode('s', { node_type: 'start' })]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)
    expect(layout.nodes).toHaveLength(1)
    expect(layout.nodes[0]!.id).toBe('s')
    expect(layout.nodes[0]!.x).toBeGreaterThanOrEqual(0)
  })

  it('creates edges for choices that reference existing nodes', () => {
    const doc = [
      makeNode('a', { node_type: 'start', choices: [makeChoice('b')] }),
      makeNode('b', { node_type: 'end' }),
    ]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)
    expect(layout.edges).toHaveLength(1)
    expect(layout.edges[0]!.sourceId).toBe('a')
    expect(layout.edges[0]!.targetId).toBe('b')
  })

  it('skips edges for dangling nextNode references', () => {
    const doc = [
      makeNode('a', { node_type: 'start', choices: [makeChoice('missing')] }),
    ]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)
    expect(layout.edges).toHaveLength(0)
  })

  it('places unreachable nodes in a separate column to the right', () => {
    const doc = [
      makeNode('s', { node_type: 'start' }),
      makeNode('orphan'),
    ]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)

    const startNode = layout.nodes.find((n) => n.id === 's')!
    const orphanNode = layout.nodes.find((n) => n.id === 'orphan')!
    expect(orphanNode.x).toBeGreaterThan(startNode.x)
  })

  it('records choiceCount on positioned nodes', () => {
    const doc = [
      makeNode('a', {
        node_type: 'start',
        choices: [makeChoice('b'), makeChoice('c')],
      }),
      makeNode('b', { node_type: 'end' }),
      makeNode('c', { node_type: 'end' }),
    ]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)
    const nodeA = layout.nodes.find((n) => n.id === 'a')!
    expect(nodeA.choiceCount).toBe(2)
  })

  it('places nodes at increasing depths from left to right', () => {
    const doc = [
      makeNode('a', { node_type: 'start', choices: [makeChoice('b')] }),
      makeNode('b', { node_type: 'narrative', choices: [makeChoice('c')] }),
      makeNode('c', { node_type: 'end' }),
    ]
    const cache = classifyAll(doc)
    const layout = computeLayout(doc, cache)

    const xByDepth = layout.nodes
      .map((n) => ({ id: n.id, x: n.x }))
      .sort((a, b) => a.x - b.x)
    expect(xByDepth[0]!.id).toBe('a')
    expect(xByDepth[2]!.id).toBe('c')
  })
})

// ---------------------------------------------------------------------------
// edgePath helper
// ---------------------------------------------------------------------------

describe('edgePath', () => {
  it('returns a string starting with M for a forward edge', () => {
    const path = edgePath(0, 0, 200, 0)
    expect(path).toMatch(/^M/)
    expect(path).toContain('C')
  })

  it('returns a path for a back edge (target to the left)', () => {
    const path = edgePath(300, 100, 50, 200)
    expect(path).toMatch(/^M/)
  })
})

// ---------------------------------------------------------------------------
// CanvasView — empty state
// ---------------------------------------------------------------------------

describe('CanvasView — empty state', () => {
  it('shows "No adventure loaded" when document is empty', async () => {
    const store = await makeStoreWithNodes([])
    renderCanvas(store)
    expect(screen.getByText(/No adventure loaded/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CanvasView — swimlane layout
// ---------------------------------------------------------------------------

describe('CanvasView — swimlane layout', () => {
  async function setup() {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    const onNodeActivate = vi.fn()
    const result = renderCanvas(store, onNodeActivate)
    return { ...result, onNodeActivate }
  }

  it('renders the scene swimlanes region', async () => {
    await setup()
    expect(screen.getByRole('region', { name: /Scene swimlanes/i })).toBeTruthy()
  })

  it('renders the preamble section for unscoped nodes', async () => {
    await setup()
    expect(screen.getByRole('region', { name: /Unscoped nodes/i })).toBeTruthy()
  })

  it('renders MiniNode buttons for nodes in the preamble', async () => {
    await setup()
    // start1 and scene1 both have sceneId=null → preamble
    // MiniNode aria-label includes the type qualifier, distinguishing it from
    // the SceneLane header button which also contains the scene title text
    expect(screen.getByRole('button', { name: /Node start1 \(start\)/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Node scene1 \(scene start\)/i })).toBeTruthy()
  })

  it('renders a SceneLane for each named scene', async () => {
    await setup()
    // node1 has sceneId='scene1' → one SceneLane
    expect(screen.getByRole('region', { name: /Scene: Node scene1/i })).toBeTruthy()
  })

  it('renders MiniNode buttons inside each SceneLane', async () => {
    await setup()
    expect(screen.getByRole('button', { name: /Node node1/i })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CanvasView — NodeDetail sidebar
// ---------------------------------------------------------------------------

describe('CanvasView — NodeDetail sidebar', () => {
  async function setup() {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    const onNodeActivate = vi.fn()
    const result = renderCanvas(store, onNodeActivate)
    return { ...result, onNodeActivate }
  }

  it('shows the NodeDetail placeholder before any node is spotlighted', async () => {
    await setup()
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
  })

  it('renders the InterSceneConnectors section heading', async () => {
    await setup()
    expect(screen.getByText('Scene connections')).toBeTruthy()
  })

  it('clicking a MiniNode spotlights it in the NodeDetail panel', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    expect(screen.getByRole('heading', { level: 2, name: 'Node node1' })).toBeTruthy()
  })

  it('clicking a MiniNode shows the SpotlightBreadcrumb', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    expect(screen.getByRole('navigation', { name: /Spotlight trail/i })).toBeTruthy()
  })

  it('"Edit in outline" calls onNodeActivate with the spotlighted node id', async () => {
    const { onNodeActivate } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    fireEvent.click(screen.getByRole('button', { name: /Edit in outline/i }))
    expect(onNodeActivate).toHaveBeenCalledWith('node1')
  })

  it('clearing the spotlight restores the placeholder', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    fireEvent.click(screen.getByRole('button', { name: /Clear spotlight/i }))
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// CanvasView — spotlight state variants
// ---------------------------------------------------------------------------

describe('CanvasView — spotlight state variants', () => {
  it('clicking a preamble MiniNode activates spotlight on it', async () => {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    renderCanvas(store)
    // Click start1 in the preamble
    fireEvent.click(screen.getByRole('button', { name: /Node start1/i }))
    // NodeDetail shows start1
    expect(screen.getByRole('heading', { level: 2, name: 'Node start1' })).toBeTruthy()
  })

  it('clicking a second node appends to the breadcrumb', async () => {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    renderCanvas(store)
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    fireEvent.click(screen.getByRole('button', { name: /Node start1/i }))
    // Both entries appear in the breadcrumb nav
    const trail = screen.getByRole('navigation', { name: /Spotlight trail/i })
    expect(trail).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('CanvasView — axe-core', () => {
  it('has no axe-core violations on the empty state', async () => {
    const store = await makeStoreWithNodes([])
    const { container } = renderCanvas(store)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe-core violations with a populated adventure (no spotlight)', async () => {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    const { container } = renderCanvas(store)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no axe-core violations after spotlight activation', async () => {
    const doc = makeSimpleDoc()
    const store = await makeStoreWithNodes(doc)
    const { container } = renderCanvas(store)
    fireEvent.click(screen.getByRole('button', { name: /Node node1/i }))
    expect(await axe(container)).toHaveNoViolations()
  })
})
