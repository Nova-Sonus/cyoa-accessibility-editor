import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen, within, act } from '@testing-library/react'
import { axe } from 'jest-axe'
import { OutlineView } from './OutlineView'
import { AdventureStoreProvider } from '../../store/StoreContext'
import { createAdventureStore } from '../../store/adventureStore'
import { InMemoryRepository } from '../../repository/InMemoryRepository'
import type { AdventureNode, Choice } from '../../types/adventure'
import { NODE_TYPES } from './NodeRow'
import { CREATE_NEW_NODE_VALUE } from './ChoiceRow'

// ---------------------------------------------------------------------------
// Test helpers
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

function makeChoice(nextNode: string, choiceText = 'Go there'): Choice {
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

function renderOutline(store: Store) {
  return render(
    <AdventureStoreProvider store={store}>
      <OutlineView />
    </AdventureStoreProvider>,
  )
}

/** Open the <details> for the nth node row (0-indexed). */
function openDetails(container: HTMLElement, index = 0) {
  const allDetails = container.querySelectorAll('ul[aria-label="Adventure outline"] > li > details')
  const detail = allDetails[index] as HTMLDetailsElement
  if (!detail) throw new Error(`No <details> at index ${index}`)
  detail.open = true
  return detail
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('OutlineView — empty state', () => {
  it('renders a message when no adventure is loaded', async () => {
    const store = createAdventureStore(new InMemoryRepository())
    const { container } = render(
      <AdventureStoreProvider store={store}>
        <OutlineView />
      </AdventureStoreProvider>,
    )
    expect(screen.getByText(/No adventure loaded/i)).toBeTruthy()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// AC: axe-core zero violations on populated outline
// ---------------------------------------------------------------------------

describe('OutlineView — accessibility', () => {
  it('has no axe violations with a multi-node adventure', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('n2', { choices: [makeChoice('n3')] }),
      makeNode('n3', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)

    // Open all rows so inner controls are in the accessibility tree.
    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with the issues panel visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    // Trigger a terminal transition to surface the issues panel.
    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'end' } })

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// AC: semantic HTML — no role="application"
// ---------------------------------------------------------------------------

describe('OutlineView — semantic HTML', () => {
  it('contains no role="application"', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expect(container.querySelector('[role="application"]')).toBeNull()
  })

  it('uses only permitted semantic elements', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    // Required elements must be present.
    expect(container.querySelector('ul')).not.toBeNull()
    expect(container.querySelector('details')).not.toBeNull()
    expect(container.querySelector('textarea')).not.toBeNull()
    expect(container.querySelector('select')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC: node_type select exposes all eight schema values
// ---------------------------------------------------------------------------

describe('OutlineView — node type select', () => {
  it('lists all eight node types in the select element', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toEqual([...NODE_TYPES])
  })
})

// ---------------------------------------------------------------------------
// AC: title edit commits to store on blur and announces
// ---------------------------------------------------------------------------

describe('OutlineView — title editing', () => {
  it('commits title to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { title: 'Old Title' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New Title' } })
    fireEvent.blur(input)

    expect(store.getState().document[0]?.title).toBe('New Title')
  })

  it('trims whitespace before committing title', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { title: 'Original' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Trimmed  ' } })
    fireEvent.blur(input)

    expect(store.getState().document[0]?.title).toBe('Trimmed')
  })

  it('does not dispatch an update when title is unchanged', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { title: 'Same' })])
    const { container } = renderOutline(store)
    openDetails(container)

    // Store document reference before blur
    const docBefore = store.getState().document

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.blur(input) // no change

    expect(store.getState().document).toBe(docBefore)
  })
})

// ---------------------------------------------------------------------------
// AC: narrativeText commits to store on blur
// ---------------------------------------------------------------------------

describe('OutlineView — narrative text editing', () => {
  it('commits narrativeText to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { narrativeText: 'Old text' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const textarea = screen.getByLabelText('Narrative text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'New text' } })
    fireEvent.blur(textarea)

    expect(store.getState().document[0]?.narrativeText).toBe('New text')
  })

  it('does not dispatch when narrativeText is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { narrativeText: 'Unchanged' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const docBefore = store.getState().document
    const textarea = screen.getByLabelText('Narrative text') as HTMLTextAreaElement
    fireEvent.blur(textarea)

    expect(store.getState().document).toBe(docBefore)
  })
})

// ---------------------------------------------------------------------------
// AC: node_type change commits immediately
// ---------------------------------------------------------------------------

describe('OutlineView — node type change', () => {
  it('commits node_type change to store on select change', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'decision' } })

    expect(store.getState().document[0]?.node_type).toBe('decision')
  })
})

// ---------------------------------------------------------------------------
// AC: terminal node_type hides choices section
// ---------------------------------------------------------------------------

describe('OutlineView — terminal node choices section', () => {
  it('hides choices section when node_type is "end"', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'end' })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })

  it('hides choices section when node_type is "adventure_success"', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'adventure_success' }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })

  it('shows choices section for non-terminal node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).not.toBeNull()
  })

  it('hides choices section after transitioning to a terminal type', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).not.toBeNull()

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'end' } })

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// AC: pre-existing choices flagged in issues panel on terminal transition
// ---------------------------------------------------------------------------

describe('OutlineView — issues panel', () => {
  it('shows issues panel when a node with choices transitions to terminal', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', {
        title: 'Decision Node',
        node_type: 'decision',
        choices: [makeChoice('n2'), makeChoice('n3')],
      }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'end' } })

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(issuesSection).toBeTruthy()
    expect(within(issuesSection).getByText(/2 choices removed/i)).toBeTruthy()
  })

  it('does not show issues panel when a childless node transitions to terminal', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'end' } })

    expect(screen.queryByRole('region', { name: 'Issues' })).toBeNull()
  })

  it('reports singular "choice" for exactly one cleared choice', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Node type'), { target: { value: 'end' } })

    expect(screen.getByText(/1 choice removed/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// AC: multiple nodes — each row is independent
// ---------------------------------------------------------------------------

describe('OutlineView — multiple nodes', () => {
  it('renders one <li> per node', async () => {
    const store = await makeStoreWithNodes([
      makeNode('a'), makeNode('b'), makeNode('c'),
    ])
    const { container } = renderOutline(store)
    const list = container.querySelector('ul[aria-label="Adventure outline"]')!
    expect(list.querySelectorAll(':scope > li')).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// OPS-530: Choice editing
// ---------------------------------------------------------------------------

describe('OutlineView — choice editing: add / delete', () => {
  it('shows "Add choice" button for non-terminal nodes', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByRole('button', { name: 'Add choice' })).toBeTruthy()
  })

  it('adds a choice to the store when "Add choice" is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'decision' })])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.click(screen.getByRole('button', { name: 'Add choice' }))

    expect(store.getState().document[0]?.choices).toHaveLength(1)
  })

  it('renders one choice row per choice in the store', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    // Each choice row renders a "Delete choice" button.
    expect(screen.getAllByRole('button', { name: 'Delete choice' })).toHaveLength(2)
  })

  it('removes a choice from the store when "Delete choice" is clicked', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete choice' })
    fireEvent.click(deleteButtons[0]!)

    expect(store.getState().document[0]?.choices).toHaveLength(1)
  })
})

describe('OutlineView — choice editing: choiceText field', () => {
  it('commits choiceText to the store on blur', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const choiceTextInput = screen.getByLabelText('Choice text') as HTMLInputElement
    fireEvent.change(choiceTextInput, { target: { value: 'Go north' } })
    fireEvent.blur(choiceTextInput)

    expect(store.getState().document[0]?.choices[0]?.choiceText).toBe('Go north')
  })

  it('does not dispatch when choiceText is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [{ ...makeChoice('n2'), choiceText: 'Existing text' }] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const docBefore = store.getState().document
    fireEvent.blur(screen.getByLabelText('Choice text'))

    expect(store.getState().document).toBe(docBefore)
  })
})

describe('OutlineView — choice editing: nextNode select', () => {
  it('lists all node ids in the nextNode select', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Next node') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)

    expect(optionValues).toContain('n1')
    expect(optionValues).toContain('n2')
    expect(optionValues).toContain('n3')
  })

  it('includes a "Create new node" option in the nextNode select', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    const select = screen.getByLabelText('Next node') as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toContain(CREATE_NEW_NODE_VALUE)
  })

  it('commits nextNode to the store on select change', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Next node'), { target: { value: 'n3' } })

    expect(store.getState().document[0]?.choices[0]?.nextNode).toBe('n3')
  })
})

// ---------------------------------------------------------------------------
// OPS-530 AC: terminal nodes show accessible explanation
// ---------------------------------------------------------------------------

describe('OutlineView — terminal node accessible message', () => {
  it('renders an explanation paragraph for "end" nodes instead of the choices section', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'end' })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
    expect(screen.getByText(/Choices are not available for terminal nodes/i)).toBeTruthy()
  })

  it('renders an explanation paragraph for "adventure_success" nodes', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'adventure_success' }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
    expect(screen.getByText(/Choices are not available for terminal nodes/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OPS-530 AC: "Create new node" via nextNode select
// ---------------------------------------------------------------------------

describe('OutlineView — create new node via nextNode combobox', () => {
  it('creates a stub node and links the choice when "Create new node" is selected', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Next node'), {
      target: { value: CREATE_NEW_NODE_VALUE },
    })

    expect(store.getState().document).toHaveLength(3)
    const newNode = store.getState().document[2]!
    expect(newNode.title).toBe('New node')
    expect(newNode.node_type).toBe('narrative')
    // The choice must now point to the new stub node.
    expect(store.getState().document[0]?.choices[0]?.nextNode).toBe(newNode.id)
  })

  it('opens the new node row and focuses its title field after creation', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('') ] }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Next node'), {
      target: { value: CREATE_NEW_NODE_VALUE },
    })

    // The new node row should have its <details> opened.
    const allDetails = container.querySelectorAll(
      'ul[aria-label="Adventure outline"] > li > details',
    )
    const newNodeDetails = allDetails[1] as HTMLDetailsElement
    expect(newNodeDetails.open).toBe(true)

    // Focus should be on the new node's title input.
    const focusedElement = container.ownerDocument.activeElement
    expect(focusedElement?.tagName).toBe('INPUT')
    expect((focusedElement as HTMLInputElement).value).toBe('New node')
  })
})

// ---------------------------------------------------------------------------
// OPS-530 AC: dangling nextNode references surfaced in issues panel
// ---------------------------------------------------------------------------

describe('OutlineView — dangling reference issues', () => {
  it('shows an issue when a choice references a node that does not exist', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [{ choiceText: 'Go there', choiceResponseConstraint: '', nextNode: 'ghost' }] }),
    ])
    renderOutline(store)

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(within(issuesSection).getByText(/missing node "ghost"/i)).toBeTruthy()
  })

  it('surfaces a dangling reference within one render cycle after deleteNode', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    renderOutline(store)

    // n2 is deleted — n1's choice now dangles. Wrap in act() so React flushes.
    act(() => {
      store.getState().deleteNode('n2')
    })

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(within(issuesSection).getByText(/missing node "n2"/i)).toBeTruthy()
  })

  it('removes the dangling issue after the choice nextNode is updated to a valid target', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    // Delete n2 to create a dangling reference.
    act(() => {
      store.getState().deleteNode('n2')
    })
    expect(screen.getByRole('region', { name: 'Issues' })).toBeTruthy()

    // Fix the dangling reference by selecting n3.
    fireEvent.change(screen.getByLabelText('Next node'), { target: { value: 'n3' } })

    expect(screen.queryByRole('region', { name: 'Issues' })).toBeNull()
  })

  it('shows a "(not found)" option in the nextNode select for a dangling reference', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    act(() => {
      store.getState().deleteNode('n2')
    })

    const select = screen.getByLabelText('Next node') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.text)
    expect(optionLabels.some((l) => l.includes('not found'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OPS-530 AC: zero axe violations with choices visible
// ---------------------------------------------------------------------------

describe('OutlineView — accessibility with choices', () => {
  it('has no axe violations when choice rows are visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)

    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with a dangling reference visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)

    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    store.getState().deleteNode('n2')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
