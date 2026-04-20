import { describe, it, expect } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { axe } from 'jest-axe'
import { CompanionPanel } from './CompanionPanel'
import { AdventureStoreProvider } from '../../store/StoreContext'
import { createAdventureStore } from '../../store/adventureStore'
import { InMemoryRepository } from '../../repository/InMemoryRepository'
import type { AdventureNode } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: `Narrative text for ${id}`,
    choices: [],
    ...overrides,
  }
}

async function makeStore(nodes: AdventureNode[]) {
  const repo = new InMemoryRepository()
  await repo.save('test', nodes)
  const store = createAdventureStore(repo)
  await store.getState().loadAdventure('test')
  return store
}

type Store = Awaited<ReturnType<typeof makeStore>>

function renderPanel(store: Store) {
  return render(
    <AdventureStoreProvider store={store}>
      <CompanionPanel />
    </AdventureStoreProvider>,
  )
}

// ---------------------------------------------------------------------------
// No selection state
// ---------------------------------------------------------------------------

describe('CompanionPanel — no node selected', () => {
  it('renders a placeholder message when no node is selected', async () => {
    const store = await makeStore([makeNode('n1')])
    renderPanel(store)
    expect(screen.getByText(/Select a node to edit/i)).toBeTruthy()
  })

  it('renders an aside with aria-label="Node editor"', async () => {
    const store = await makeStore([makeNode('n1')])
    renderPanel(store)
    expect(screen.getByRole('complementary', { name: 'Node editor' })).toBeTruthy()
  })

  it('has no axe violations in the empty state', async () => {
    const store = await makeStore([makeNode('n1')])
    const { container } = renderPanel(store)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// Node selected — field display
// ---------------------------------------------------------------------------

describe('CompanionPanel — node selected', () => {
  it('displays the Node ID field as disabled with the correct value', async () => {
    const store = await makeStore([makeNode('abc-123')])
    store.getState().setSelectedNodeId('abc-123')
    renderPanel(store)
    const nodeIdInput = screen.getByLabelText('Node ID') as HTMLInputElement
    expect(nodeIdInput.value).toBe('abc-123')
    expect(nodeIdInput.disabled).toBe(true)
  })

  it('displays the title field with the node title', async () => {
    const store = await makeStore([makeNode('n1', { title: 'My Title' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const titleInput = screen.getByLabelText('Title') as HTMLInputElement
    expect(titleInput.value).toBe('My Title')
  })

  it('displays the node_type select with the correct value', async () => {
    const store = await makeStore([makeNode('n1', { node_type: 'decision' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    expect(select.value).toBe('decision')
  })

  it('displays the narrative text textarea with the node narrativeText', async () => {
    const store = await makeStore([makeNode('n1', { narrativeText: 'Once upon a time…' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const textarea = screen.getByLabelText('Narrative text') as HTMLTextAreaElement
    expect(textarea.value).toBe('Once upon a time…')
  })

  it('renders the TTS button as disabled with title="Coming soon"', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const ttsBtn = screen.getByRole('button', { name: /TTS/i }) as HTMLButtonElement
    expect(ttsBtn.disabled).toBe(true)
    expect(ttsBtn.title).toBe('Coming soon')
  })

  it('has no axe violations with a node selected', async () => {
    const store = await makeStore([makeNode('n1', { title: 'Test Node', narrativeText: 'Some text.' })])
    store.getState().setSelectedNodeId('n1')
    const { container } = renderPanel(store)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// Classifier tag badges
// ---------------------------------------------------------------------------

describe('CompanionPanel — classifier tag badges', () => {
  it('shows the Orphan badge for a non-start node with no incoming edges', async () => {
    const store = await makeStore([
      makeNode('start', { node_type: 'start' }),
      makeNode('orphan'),
    ])
    store.getState().setSelectedNodeId('orphan')
    renderPanel(store)
    expect(screen.getByText('Orphan')).toBeTruthy()
  })

  it('shows the Terminal badge for a terminal node', async () => {
    const store = await makeStore([makeNode('end', { node_type: 'end' })])
    store.getState().setSelectedNodeId('end')
    renderPanel(store)
    expect(screen.getByText('Terminal')).toBeTruthy()
  })

  it('shows a Depth badge with a finite depth value', async () => {
    const store = await makeStore([
      makeNode('start', {
        node_type: 'start',
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: 'n2' }],
      }),
      makeNode('n2'),
    ])
    store.getState().setSelectedNodeId('n2')
    renderPanel(store)
    expect(screen.getByText('Depth: 1')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Reactive update when selectedNodeId changes
// ---------------------------------------------------------------------------

describe('CompanionPanel — reactive update on selection change', () => {
  it('updates all fields to reflect the newly selected node without remounting', async () => {
    const store = await makeStore([
      makeNode('n1', { title: 'First Node', narrativeText: 'First text' }),
      makeNode('n2', { title: 'Second Node', narrativeText: 'Second text' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)

    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('First Node')

    act(() => { store.getState().setSelectedNodeId('n2') })
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Second Node')
    expect((screen.getByLabelText('Narrative text') as HTMLTextAreaElement).value).toBe('Second text')
  })
})
