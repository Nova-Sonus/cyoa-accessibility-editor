import { describe, it, expect } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
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

  it('renders the node title as an h2', async () => {
    const store = await makeStore([makeNode('n1', { title: 'My Adventure Node' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByRole('heading', { level: 2, name: 'My Adventure Node' })).toBeTruthy()
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
// Audio section
// ---------------------------------------------------------------------------

describe('CompanionPanel — audio section', () => {
  it('shows Audio section toggle', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByRole('button', { name: /Audio/i })).toBeTruthy()
  })

  it('displays entry_foley value after opening Audio section', async () => {
    const store = await makeStore([makeNode('n1', { entry_foley: 'cave_entrance.mp3' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    // Open the Audio section
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    const entryFoleyInput = screen.getByLabelText('Entry foley') as HTMLInputElement
    expect(entryFoleyInput.value).toBe('cave_entrance.mp3')
  })
})

// ---------------------------------------------------------------------------
// Gameplay section
// ---------------------------------------------------------------------------

describe('CompanionPanel — gameplay section', () => {
  it('shows Gameplay section toggle', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByRole('button', { name: /Gameplay/i })).toBeTruthy()
  })

  it('shows checkpoint checked when node has checkpoint=true after opening section', async () => {
    const store = await makeStore([makeNode('n1', { checkpoint: true })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('toggling checkpoint checkbox updates the store', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    act(() => { fireEvent.click(checkbox) })
    expect(store.getState().document[0]!.checkpoint).toBe(true)
    act(() => { fireEvent.click(checkbox) })
    expect(store.getState().document[0]!.checkpoint).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Choices section
// ---------------------------------------------------------------------------

describe('CompanionPanel — choices section', () => {
  it('shows "No choices yet." when node has no choices', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByText('No choices yet.')).toBeTruthy()
  })

  it('shows terminal message for terminal nodes', async () => {
    const store = await makeStore([makeNode('end', { node_type: 'end' })])
    store.getState().setSelectedNodeId('end')
    renderPanel(store)
    expect(screen.getByText(/Terminal nodes cannot have choices/i)).toBeTruthy()
  })

  it('renders choice rows for nodes with choices', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [
          { choiceText: 'Go left', choiceResponseConstraint: '', nextNode: '' },
          { choiceText: 'Go right', choiceResponseConstraint: '', nextNode: '' },
        ],
      }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByDisplayValue('Go left')).toBeTruthy()
    expect(screen.getByDisplayValue('Go right')).toBeTruthy()
  })

  it('shows + Add choice button for non-terminal nodes', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByRole('button', { name: /Add choice/i })).toBeTruthy()
  })

  it('adds a choice when + Add choice is clicked', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Add choice/i })) })
    expect(store.getState().document[0]!.choices).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Footer — delete node
// ---------------------------------------------------------------------------

describe('CompanionPanel — delete node', () => {
  it('shows Delete node button for non-start nodes', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    expect(screen.getByRole('button', { name: /Delete node/i })).toBeTruthy()
  })

  it('does not show Delete node button for start nodes', async () => {
    const store = await makeStore([makeNode('start', { node_type: 'start' })])
    store.getState().setSelectedNodeId('start')
    renderPanel(store)
    expect(screen.queryByRole('button', { name: /Delete node/i })).toBeNull()
  })

  it('shows confirmation on Delete node click', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Delete node/i }))
    expect(screen.getByRole('button', { name: /Confirm delete/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeTruthy()
  })

  it('cancels delete on Cancel click', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Delete node/i }))
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(screen.getByRole('button', { name: /Delete node/i })).toBeTruthy()
  })

  it('deletes node on Confirm delete click', async () => {
    const store = await makeStore([
      makeNode('start', { node_type: 'start' }),
      makeNode('n1'),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Delete node/i }))
    act(() => { fireEvent.click(screen.getByRole('button', { name: /Confirm delete/i })) })
    expect(store.getState().document).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// ActivitiesList
// ---------------------------------------------------------------------------

describe('CompanionPanel — activities list', () => {
  it('shows "No activities yet." when gameplay section is opened with no activities', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    expect(screen.getByText('No activities yet.')).toBeTruthy()
  })

  it('adds an activity via the Add button', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    fireEvent.change(screen.getByLabelText('New activity'), { target: { value: 'Fight the troll' } })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    expect(store.getState().document[0]!.activities).toEqual(['Fight the troll'])
  })

  it('adds an activity via Enter key', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    fireEvent.change(screen.getByLabelText('New activity'), { target: { value: 'Solve puzzle' } })
    act(() => { fireEvent.keyDown(screen.getByLabelText('New activity'), { key: 'Enter' }) })
    expect(store.getState().document[0]!.activities).toEqual(['Solve puzzle'])
  })

  it('does not add empty activity', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    expect(store.getState().document[0]!.activities).toBeUndefined()
  })

  it('deletes an activity', async () => {
    const store = await makeStore([makeNode('n1', { activities: ['Fight', 'Run'] })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Gameplay/i }))
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Delete activity: Fight' })) })
    expect(store.getState().document[0]!.activities).toEqual(['Run'])
  })
})

// ---------------------------------------------------------------------------
// NodeComboField
// ---------------------------------------------------------------------------

describe('CompanionPanel — NodeComboField (next node)', () => {
  it('shows the next node title in the combobox input', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: 'n2' }],
      }),
      makeNode('n2', { title: 'The Second Node' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const nextNodeInput = screen.getByLabelText('Next node') as HTMLInputElement
    expect(nextNodeInput.value).toBe('The Second Node')
  })

  it('opens listbox on focus and shows options', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const nextNodeInput = screen.getByLabelText('Next node')
    fireEvent.focus(nextNodeInput)
    expect(screen.getByRole('option', { name: 'Node Two' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Create new node/i })).toBeTruthy()
  })

  it('selecting an option updates the choice nextNode', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.focus(screen.getByLabelText('Next node'))
    act(() => {
      fireEvent.mouseDown(screen.getByRole('option', { name: 'Node Two' }))
    })
    expect(store.getState().document[0]!.choices[0]!.nextNode).toBe('n2')
  })

  it('Create new node… creates a decision node and links it', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.focus(screen.getByLabelText('Next node'))
    act(() => {
      fireEvent.mouseDown(screen.getByRole('option', { name: /Create new node/i }))
    })
    const doc = store.getState().document
    expect(doc).toHaveLength(2)
    const newNode = doc.find((n) => n.id !== 'n1')!
    expect(newNode.node_type).toBe('decision')
    expect(doc[0]!.choices[0]!.nextNode).toBe(newNode.id)
  })

  it('ArrowDown opens listbox', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    const { container } = renderPanel(store)
    const input = screen.getByLabelText('Next node')
    const listboxId = input.getAttribute('aria-controls')!
    const listbox = container.querySelector(`#${CSS.escape(listboxId)}`)! as HTMLElement
    expect(listbox.hidden).toBe(true)
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    expect(listbox.hidden).toBe(false)
  })

  it('Enter key selects the active option', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const input = screen.getByLabelText('Next node')
    // ArrowDown once: opens listbox, active = 0 (first node in list)
    // ArrowDown again: active = 1 (Node Two)
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(input, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(input, { key: 'Enter' }) })
    expect(store.getState().document[0]!.choices[0]!.nextNode).toBe('n2')
  })

  it('chevron button toggles the listbox open/closed', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    const { container } = renderPanel(store)
    const input = screen.getByLabelText('Next node')
    const listboxId = input.getAttribute('aria-controls')!
    const listbox = container.querySelector(`#${CSS.escape(listboxId)}`)! as HTMLElement
    // Find the chevron button (aria-hidden, sibling of input)
    const chevron = container.querySelector(`[aria-controls="${CSS.escape(listboxId)}"]`)?.parentElement?.querySelector('button[aria-hidden]') as HTMLElement
    expect(listbox.hidden).toBe(true)
    act(() => { fireEvent.click(chevron) })
    expect(listbox.hidden).toBe(false)
    act(() => { fireEvent.click(chevron) })
    expect(listbox.hidden).toBe(true)
  })

  it('Escape closes the listbox', async () => {
    const store = await makeStore([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: '', nextNode: '' }],
      }),
      makeNode('n2', { title: 'Node Two' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    const input = screen.getByLabelText('Next node')
    fireEvent.focus(input)
    expect(screen.getByRole('option', { name: 'Node Two' })).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('option', { name: 'Node Two' })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AudioComboField
// ---------------------------------------------------------------------------

describe('CompanionPanel — audio fields', () => {
  it('updates entry_foley on input change', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    act(() => {
      fireEvent.change(screen.getByLabelText('Entry foley'), { target: { value: 'door.mp3' } })
    })
    expect(store.getState().document[0]!.entry_foley).toBe('door.mp3')
  })

  it('updates music field on input change', async () => {
    const store = await makeStore([makeNode('n1')])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    act(() => {
      fireEvent.change(screen.getByLabelText('Music'), { target: { value: 'theme.mp3' } })
    })
    expect(store.getState().document[0]!.music).toBe('theme.mp3')
  })

  it('clears entry_foley when value is emptied', async () => {
    const store = await makeStore([makeNode('n1', { entry_foley: 'old.mp3' })])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    act(() => {
      fireEvent.change(screen.getByLabelText('Entry foley'), { target: { value: '' } })
    })
    expect(store.getState().document[0]!.entry_foley).toBeUndefined()
  })

  it('opens suggestion listbox on focus and ArrowDown navigates it', async () => {
    const store = await makeStore([
      makeNode('n1', { entry_foley: '' }),
      makeNode('n2', { entry_foley: 'cave.mp3' }),
    ])
    store.getState().setSelectedNodeId('n1')
    const { container } = renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    const entryInput = screen.getByLabelText('Entry foley')
    const listboxId = entryInput.getAttribute('aria-controls')!
    const listbox = container.querySelector(`#${CSS.escape(listboxId)}`)! as HTMLElement
    // Focus opens suggestions for matching items
    act(() => { fireEvent.focus(entryInput) })
    // Type to get filtered results
    act(() => { fireEvent.change(entryInput, { target: { value: 'cave' } }) })
    expect(listbox.hidden).toBe(false)
    // ArrowDown navigates
    act(() => { fireEvent.keyDown(entryInput, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(entryInput, { key: 'ArrowUp' }) })
    // Escape closes
    act(() => { fireEvent.keyDown(entryInput, { key: 'Escape' }) })
    expect(listbox.hidden).toBe(true)
  })

  it('Enter in audio combobox selects the active option', async () => {
    const store = await makeStore([
      makeNode('n1', { entry_foley: '' }),
      makeNode('n2', { entry_foley: 'cave.mp3' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    const entryInput = screen.getByLabelText('Entry foley')
    act(() => { fireEvent.change(entryInput, { target: { value: 'cave' } }) })
    act(() => { fireEvent.keyDown(entryInput, { key: 'ArrowDown' }) })
    act(() => { fireEvent.keyDown(entryInput, { key: 'Enter' }) })
    expect(store.getState().document[0]!.entry_foley).toBe('cave.mp3')
  })

  it('mousedown on audio suggestion option selects it', async () => {
    const store = await makeStore([
      makeNode('n1', { entry_foley: '' }),
      makeNode('n2', { entry_foley: 'cave.mp3' }),
    ])
    store.getState().setSelectedNodeId('n1')
    renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    const entryInput = screen.getByLabelText('Entry foley')
    act(() => { fireEvent.change(entryInput, { target: { value: 'cave' } }) })
    const options = screen.getAllByRole('option', { hidden: true })
    const caveOption = options.find((o) => o.textContent?.includes('cave.mp3'))!
    act(() => { fireEvent.mouseDown(caveOption) })
    expect(store.getState().document[0]!.entry_foley).toBe('cave.mp3')
  })

  it('ArrowDown from closed audio combobox opens and selects first item', async () => {
    const store = await makeStore([
      makeNode('n1', { entry_foley: '' }),
      makeNode('n2', { entry_foley: 'cave.mp3' }),
    ])
    store.getState().setSelectedNodeId('n1')
    const { container } = renderPanel(store)
    fireEvent.click(screen.getByRole('button', { name: /Audio/i }))
    const entryInput = screen.getByLabelText('Entry foley')
    // Ensure listbox is closed: don't focus first
    const listboxId = entryInput.getAttribute('aria-controls')!
    const listbox = container.querySelector(`#${CSS.escape(listboxId)}`)! as HTMLElement
    expect(listbox.hidden).toBe(true)
    // ArrowDown from closed state should open it
    act(() => { fireEvent.keyDown(entryInput, { key: 'ArrowDown' }) })
    // The listbox should now be open (filtered has cave.mp3)
    expect(listbox.hidden).toBe(false)
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
