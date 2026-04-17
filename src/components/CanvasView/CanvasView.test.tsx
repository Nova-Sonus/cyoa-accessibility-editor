import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
    // Orphan column is to the right
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
// CanvasView component
// ---------------------------------------------------------------------------

describe('CanvasView — empty state', () => {
  it('shows "No adventure loaded" when document is empty', async () => {
    const store = await makeStoreWithNodes([])
    renderCanvas(store)
    expect(screen.getByText(/No adventure loaded/i)).toBeTruthy()
  })
})

describe('CanvasView — with nodes', () => {
  async function setup() {
    const doc = [
      makeNode('start1', { node_type: 'start', choices: [makeChoice('mid1', 'Go forward')] }),
      makeNode('mid1', { node_type: 'decision', choices: [makeChoice('end1', 'Finish')] }),
      makeNode('end1', { node_type: 'end' }),
    ]
    const store = await makeStoreWithNodes(doc)
    const onNodeActivate = vi.fn()
    const result = renderCanvas(store, onNodeActivate)
    return { ...result, onNodeActivate }
  }

  it('renders the accessible node list with all nodes', async () => {
    await setup()
    // The accessible section has a heading
    expect(screen.getByText(/Nodes \(3\)/i)).toBeTruthy()
    // Each node appears as a button in the list
    expect(screen.getByRole('button', { name: /Node start1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Node mid1/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Node end1/i })).toBeTruthy()
  })

  it('calls onNodeActivate when a node list button is clicked', async () => {
    const { onNodeActivate } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1/i }))
    expect(onNodeActivate).toHaveBeenCalledWith('start1')
  })

  it('renders zoom controls toolbar', async () => {
    await setup()
    expect(screen.getByRole('toolbar', { name: /Canvas controls/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Zoom in/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Zoom out/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reset view/i })).toBeTruthy()
  })

  it('renders the legend', async () => {
    await setup()
    expect(screen.getByRole('generic', { name: /Node type legend/i })).toBeTruthy()
  })

  it('shows node types as metadata in accessible list items', async () => {
    await setup()
    // mid1 is a decision node — the type label appears within its list button
    const mid1Button = screen.getByRole('button', { name: /Node mid1/i })
    expect(within(mid1Button).getByText(/decision/i)).toBeTruthy()
  })
})

describe('CanvasView — checkpoint node', () => {
  it('shows checkpoint indicator in the accessible node list', async () => {
    const doc = [
      makeNode('s', { node_type: 'start', choices: [makeChoice('cp')] }),
      makeNode('cp', { node_type: 'narrative', checkpoint: true }),
    ]
    const store = await makeStoreWithNodes(doc)
    renderCanvas(store)

    const cpButton = screen.getByRole('button', { name: /Node cp/i })
    expect(within(cpButton).getByText(/checkpoint/i)).toBeTruthy()
  })
})

describe('CanvasView — orphan node', () => {
  it('shows orphan indicator in the accessible node list', async () => {
    const doc = [
      makeNode('s', { node_type: 'start' }),
      makeNode('orphan'),
    ]
    const store = await makeStoreWithNodes(doc)
    renderCanvas(store)

    const orphanButton = screen.getByRole('button', { name: /Node orphan/i })
    // Match the metadata span text ("· orphan") to avoid ambiguity with the node title
    expect(within(orphanButton).getByText(/·\s*orphan/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('CanvasView — axe-core', () => {
  it('has no axe-core violations on the empty state', async () => {
    const store = await makeStoreWithNodes([])
    const { container } = renderCanvas(store)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe-core violations with a populated adventure', async () => {
    const doc = [
      makeNode('s', {
        node_type: 'start',
        choices: [makeChoice('a', 'Go left'), makeChoice('b', 'Go right')],
      }),
      makeNode('a', { node_type: 'narrative', checkpoint: true }),
      makeNode('b', { node_type: 'end' }),
      makeNode('orphan'),
    ]
    const store = await makeStoreWithNodes(doc)
    const { container } = renderCanvas(store)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
