import { describe, it, expect, vi } from 'vitest'
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

/**
 * Returns the <li> element for the nth node row (0-indexed).
 */
function getNodeRow(container: HTMLElement, index = 0): HTMLElement {
  const items = container.querySelectorAll('ul[aria-label="Adventure outline"] > li')
  const item = items[index] as HTMLElement
  if (!item) throw new Error(`No node row <li> at index ${index}`)
  return item
}

/**
 * Expands the accordion for the nth node row (0-indexed) by clicking its
 * header button if not already expanded.  Returns the <li> element.
 */
function expandNode(container: HTMLElement, index = 0): HTMLElement {
  const row = getNodeRow(container, index)
  const button = row.querySelector('button[aria-expanded]') as HTMLButtonElement
  if (!button) throw new Error(`No accordion header button in row ${index}`)
  if (button.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(button)
  }
  return row
}

/** Expand every node row in the outline. */
function expandAllNodes(container: HTMLElement) {
  const buttons = container.querySelectorAll(
    'ul[aria-label="Adventure outline"] > li > button[aria-expanded]',
  )
  buttons.forEach((btn) => {
    if (btn.getAttribute('aria-expanded') !== 'true') {
      fireEvent.click(btn as HTMLButtonElement)
    }
  })
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

    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with the issues panel showing structural issues', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan'),
    ])
    const { container } = renderOutline(store)

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
    expandNode(container)

    expect(container.querySelector('ul')).not.toBeNull()
    expect(container.querySelector('button[aria-expanded]')).not.toBeNull()
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
    expandNode(container)

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
    expandNode(container)

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'New Title' } })
    fireEvent.blur(input)

    expect(store.getState().document[0]?.title).toBe('New Title')
  })

  it('trims whitespace before committing title', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { title: 'Original' })])
    const { container } = renderOutline(store)
    expandNode(container)

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Trimmed  ' } })
    fireEvent.blur(input)

    expect(store.getState().document[0]?.title).toBe('Trimmed')
  })

  it('does not dispatch an update when title is unchanged', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { title: 'Same' })])
    const { container } = renderOutline(store)
    expandNode(container)

    const docBefore = store.getState().document

    const input = screen.getByLabelText('Title') as HTMLInputElement
    fireEvent.blur(input)

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
    expandNode(container)

    const textarea = screen.getByLabelText('Narrative text') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'New text' } })
    fireEvent.blur(textarea)

    expect(store.getState().document[0]?.narrativeText).toBe('New text')
  })

  it('does not dispatch when narrativeText is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { narrativeText: 'Unchanged' })])
    const { container } = renderOutline(store)
    expandNode(container)

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
    expandNode(container)

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
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })

  it('hides choices section when node_type is "adventure_success"', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'adventure_success' }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })

  it('shows choices section for non-terminal node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).not.toBeNull()
  })

  it('hides choices section after transitioning to a terminal type', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'narrative' })])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).not.toBeNull()

    const select = screen.getByLabelText('Node type') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'end' } })

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// OPS-531: Issues panel — always visible
// ---------------------------------------------------------------------------

describe('OutlineView — issues panel always visible', () => {
  it('renders the issues panel region even when there are no structural issues', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    expect(screen.getByRole('region', { name: 'Issues' })).toBeTruthy()
  })

  it('shows "No issues found" when the document is structurally clean', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })

  it('shows "No issues found" when a childless node transitions to terminal type', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'narrative' }),
    ])
    const { container } = renderOutline(store)
    const n2Row = expandNode(container, 1)

    fireEvent.change(within(n2Row).getByLabelText('Node type'), { target: { value: 'end' } })

    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OPS-531: Terminal transition — choices-cleared announcement
// ---------------------------------------------------------------------------

describe('OutlineView — terminal transition choices-cleared announcement', () => {
  it('fires the choices-cleared announce path and surfaces an issue count in the live region', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2', { node_type: 'end' }),
      makeNode('n3', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)
    const n1Row = expandNode(container, 0)

    vi.useFakeTimers()
    try {
      fireEvent.change(within(n1Row).getByLabelText('Node type'), { target: { value: 'end' } })

      await act(async () => { vi.advanceTimersByTime(100) })

      expect(screen.getByRole('status').textContent).toMatch(/3 issues found/i)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// OPS-531: Issues panel — structural issue detection (reactive)
// ---------------------------------------------------------------------------

describe('OutlineView — issues panel: orphan detection', () => {
  it('shows an orphan issue for a non-start node with no incoming edges', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    renderOutline(store)

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(within(issuesSection).getByText(/Orphan node/i)).toBeTruthy()
    expect(within(issuesSection).getByText(/Lost Node/i)).toBeTruthy()
  })

  it('removes the orphan issue within one render cycle after the node gains an incoming edge', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [] }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(within(screen.getByRole('region', { name: 'Issues' })).getByText(/Orphan node/i)).toBeTruthy()

    act(() => {
      store.getState().addChoice('n1', { choiceText: '', choiceResponseConstraint: '', nextNode: 'orphan' })
    })

    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })
})

describe('OutlineView — issues panel: dangling reference detection', () => {
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

    act(() => {
      store.getState().deleteNode('n2')
    })

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(within(issuesSection).getByText(/missing node "n2"/i)).toBeTruthy()
  })

  it('removes the dangling issue after the choice nextNode is updated to a valid target', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
      makeNode('n3', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    act(() => {
      store.getState().deleteNode('n2')
    })
    expect(screen.getByRole('region', { name: 'Issues' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Next node'), { target: { value: 'n3' } })

    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })

  it('shows a "(not found)" option in the nextNode select for a dangling reference', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    act(() => {
      store.getState().deleteNode('n2')
    })

    const select = screen.getByLabelText('Next node') as HTMLSelectElement
    const optionLabels = Array.from(select.options).map((o) => o.text)
    expect(optionLabels.some((l) => l.includes('not found'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// OPS-531: Issues panel — focus activation
// ---------------------------------------------------------------------------

describe('OutlineView — issues panel: focus activation', () => {
  it('opens the node accordion and focuses the title field when an issue is activated', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    const { container } = renderOutline(store)

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    const activateButton = within(issuesSection).getByRole('button')

    fireEvent.click(activateButton)

    // The orphan node's accordion header should now be expanded.
    const allButtons = container.querySelectorAll(
      'ul[aria-label="Adventure outline"] > li > button[aria-expanded]',
    )
    const orphanButton = allButtons[1] as HTMLButtonElement
    expect(orphanButton.getAttribute('aria-expanded')).toBe('true')

    // Focus should be on the orphan node's title input.
    const focusedElement = container.ownerDocument.activeElement
    expect(focusedElement?.tagName).toBe('INPUT')
    expect((focusedElement as HTMLInputElement).value).toBe('Lost Node')
  })
})

// ---------------------------------------------------------------------------
// OPS-531: aria-live count announcements
// ---------------------------------------------------------------------------

describe('OutlineView — aria-live issue count announcements', () => {
  it('announces count when a new issue appears', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    vi.useFakeTimers()
    try {
      act(() => {
        store.getState().deleteNode('n2')
      })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(screen.getByRole('status').textContent).toMatch(/issue/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces "No issues" when all issues are resolved', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    vi.useFakeTimers()
    try {
      act(() => {
        store.getState().deleteNode('n2')
      })
      await act(async () => { vi.advanceTimersByTime(100) })

      act(() => {
        store.getState().updateChoice('n1', 0, { nextNode: '' })
      })
      await act(async () => { vi.advanceTimersByTime(100) })

      expect(screen.getByRole('status').textContent).toMatch(/No issues/i)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// OPS-531: axe-core zero violations — issues panel always visible
// ---------------------------------------------------------------------------

describe('OutlineView — accessibility: issues panel always present', () => {
  it('has no axe violations when "No issues found" is displayed', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations when issues are listed', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    const { container } = renderOutline(store)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
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
    expandNode(container)

    expect(screen.getByRole('button', { name: 'Add choice' })).toBeTruthy()
  })

  it('adds a choice to the store when "Add choice" is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'decision' })])
    const { container } = renderOutline(store)
    expandNode(container)

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
    expandNode(container)

    expect(screen.getAllByRole('button', { name: 'Delete choice' })).toHaveLength(2)
  })

  it('removes a choice from the store when "Delete choice" is clicked', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

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
    expandNode(container)

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
    expandNode(container)

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
    expandNode(container)

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
    expandNode(container)

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
    expandNode(container)

    fireEvent.change(screen.getByLabelText('Next node'), { target: { value: 'n3' } })

    expect(store.getState().document[0]?.choices[0]?.nextNode).toBe('n3')
  })
})

// ---------------------------------------------------------------------------
// OPS-530 AC: terminal nodes show accessible explanation
// ---------------------------------------------------------------------------

describe('OutlineView — terminal node accessible message', () => {
  it('renders an info box for "end" nodes instead of the choices section', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'end' })])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
    expect(screen.getByText(/Terminal node — choices are not permitted on end nodes/i)).toBeTruthy()
  })

  it('renders an info box for "adventure_success" nodes', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'adventure_success' }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(container.querySelector('section[aria-label^="Choices"]')).toBeNull()
    expect(screen.getByText(/Terminal node — choices are not permitted on adventure_success nodes/i)).toBeTruthy()
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
    expandNode(container)

    fireEvent.change(screen.getByLabelText('Next node'), {
      target: { value: CREATE_NEW_NODE_VALUE },
    })

    expect(store.getState().document).toHaveLength(3)
    const newNode = store.getState().document[2]!
    expect(newNode.title).toBe('New node')
    expect(newNode.node_type).toBe('decision')
    expect(store.getState().document[0]?.choices[0]?.nextNode).toBe(newNode.id)
  })

  it('opens the new node accordion and focuses its title field after creation', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('')] }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    fireEvent.change(screen.getByLabelText('Next node'), {
      target: { value: CREATE_NEW_NODE_VALUE },
    })

    // The new node row's accordion header should be expanded.
    const allButtons = container.querySelectorAll(
      'ul[aria-label="Adventure outline"] > li > button[aria-expanded]',
    )
    const newNodeButton = allButtons[1] as HTMLButtonElement
    expect(newNodeButton.getAttribute('aria-expanded')).toBe('true')

    // Focus should be on the new node's title input.
    const focusedElement = container.ownerDocument.activeElement
    expect(focusedElement?.tagName).toBe('INPUT')
    expect((focusedElement as HTMLInputElement).value).toBe('New node')
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
    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with a dangling reference visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandAllNodes(container)

    store.getState().deleteNode('n2')

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-532: Audio fields — entry_foley, music, sounds
// ---------------------------------------------------------------------------

describe('OutlineView — audio fields: render', () => {
  it('renders Entry foley, Music, and Ambient sounds inputs when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    // Audio section is collapsed by default; expand the node then the audio section.
    const row = expandNode(container)
    const audioToggle = within(row).getByRole('button', { name: /Audio/i })
    fireEvent.click(audioToggle)

    expect(screen.getByLabelText('Entry foley')).toBeTruthy()
    expect(screen.getByLabelText('Music')).toBeTruthy()
    expect(screen.getByLabelText('Ambient sounds')).toBeTruthy()
  })

  it('prepopulates audio fields from the node document', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg', sounds: 'wind.mp3' }),
    ])
    const { container } = renderOutline(store)
    const row = expandNode(container)
    const audioToggle = within(row).getByRole('button', { name: /Audio/i })
    fireEvent.click(audioToggle)

    expect((screen.getByLabelText('Entry foley') as HTMLInputElement).value).toBe('cave.mp3')
    expect((screen.getByLabelText('Music') as HTMLInputElement).value).toBe('theme.ogg')
    expect((screen.getByLabelText('Ambient sounds') as HTMLInputElement).value).toBe('wind.mp3')
  })

  it('shows empty audio inputs when fields are absent from the node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    const row = expandNode(container)
    const audioToggle = within(row).getByRole('button', { name: /Audio/i })
    fireEvent.click(audioToggle)

    expect((screen.getByLabelText('Entry foley') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Music') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Ambient sounds') as HTMLInputElement).value).toBe('')
  })
})

describe('OutlineView — audio fields: commit on blur', () => {
  function expandAudio(container: HTMLElement, index = 0) {
    const row = expandNode(container, index)
    const audioToggle = within(row).getByRole('button', { name: /Audio/i })
    fireEvent.click(audioToggle)
    return row
  }

  it('commits entry_foley to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandAudio(container)

    fireEvent.change(screen.getByLabelText('Entry foley'), { target: { value: 'drip.mp3' } })
    fireEvent.blur(screen.getByLabelText('Entry foley'))

    expect(store.getState().document[0]?.entry_foley).toBe('drip.mp3')
  })

  it('commits music to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandAudio(container)

    fireEvent.change(screen.getByLabelText('Music'), { target: { value: 'boss.ogg' } })
    fireEvent.blur(screen.getByLabelText('Music'))

    expect(store.getState().document[0]?.music).toBe('boss.ogg')
  })

  it('commits sounds to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandAudio(container)

    fireEvent.change(screen.getByLabelText('Ambient sounds'), { target: { value: 'rain.mp3' } })
    fireEvent.blur(screen.getByLabelText('Ambient sounds'))

    expect(store.getState().document[0]?.sounds).toBe('rain.mp3')
  })

  it('does not dispatch when entry_foley is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { entry_foley: 'existing.mp3' })])
    const { container } = renderOutline(store)
    expandAudio(container)

    const docBefore = store.getState().document
    fireEvent.blur(screen.getByLabelText('Entry foley'))

    expect(store.getState().document).toBe(docBefore)
  })

  it('clears entry_foley field (sets to undefined) when value is blanked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { entry_foley: 'cave.mp3' })])
    const { container } = renderOutline(store)
    expandAudio(container)

    fireEvent.change(screen.getByLabelText('Entry foley'), { target: { value: '' } })
    fireEvent.blur(screen.getByLabelText('Entry foley'))

    expect(store.getState().document[0]?.entry_foley).toBeUndefined()
  })
})

describe('OutlineView — audio fields: accessibility', () => {
  it('has no axe violations with audio fields visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg', sounds: 'wind.mp3' }),
    ])
    const { container } = renderOutline(store)
    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-532: Asset manifest panel — integration via OutlineView
// ---------------------------------------------------------------------------

describe('OutlineView — asset manifest panel', () => {
  it('renders the asset manifest region', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    renderOutline(store)

    expect(screen.getByRole('region', { name: 'Asset manifest' })).toBeTruthy()
  })

  it('shows "No audio assets referenced" when no audio fields are set', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    renderOutline(store)

    expect(screen.getByText(/No audio assets referenced/i)).toBeTruthy()
  })

  it('lists audio assets from nodes in the manifest', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { music: 'theme.ogg' }),
    ])
    renderOutline(store)

    const manifest = screen.getByRole('region', { name: 'Asset manifest' })
    expect(within(manifest).getByText('theme.ogg')).toBeTruthy()
  })

  it('updates the manifest when an audio field is committed', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    const row = expandNode(container)
    const audioToggle = within(row).getByRole('button', { name: /Audio/i })
    fireEvent.click(audioToggle)

    expect(screen.getByText(/No audio assets referenced/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Music'), { target: { value: 'new_track.ogg' } })
    fireEvent.blur(screen.getByLabelText('Music'))

    const manifest = screen.getByRole('region', { name: 'Asset manifest' })
    expect(within(manifest).getByText('new_track.ogg')).toBeTruthy()
  })

  it('has no axe violations with the asset manifest visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg' }),
    ])
    const { container } = renderOutline(store)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-533: choiceResponseConstraint field
// ---------------------------------------------------------------------------

describe('OutlineView — choice editing: choiceResponseConstraint field', () => {
  it('renders the Response constraint field for each choice', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(screen.getByLabelText('Response constraint')).toBeTruthy()
  })

  it('pre-populates the constraint field from the document', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: 'strength >= 10', nextNode: 'n2' }],
      }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect((screen.getByLabelText('Response constraint') as HTMLInputElement).value).toBe('strength >= 10')
  })

  it('commits choiceResponseConstraint to the store on blur', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    fireEvent.change(screen.getByLabelText('Response constraint'), { target: { value: 'dexterity > 5' } })
    fireEvent.blur(screen.getByLabelText('Response constraint'))

    expect(store.getState().document[0]?.choices[0]?.choiceResponseConstraint).toBe('dexterity > 5')
  })

  it('does not dispatch when choiceResponseConstraint is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: 'strength >= 10', nextNode: 'n2' }],
      }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    const docBefore = store.getState().document
    fireEvent.blur(screen.getByLabelText('Response constraint'))

    expect(store.getState().document).toBe(docBefore)
  })

  it('round-trips choiceResponseConstraint through save and load', async () => {
    const repo = new (await import('../../repository/InMemoryRepository')).InMemoryRepository()
    await repo.save('test', [
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: 'level >= 3', nextNode: 'n2' }],
      }),
      makeNode('n2'),
    ])
    const store = createAdventureStore(repo)
    await store.getState().loadAdventure('test')

    await store.getState().saveAdventure()

    const reloadedStore = createAdventureStore(repo)
    await reloadedStore.getState().loadAdventure('test')

    expect(reloadedStore.getState().document[0]?.choices[0]?.choiceResponseConstraint).toBe('level >= 3')
  })

  it('has no axe violations with the constraint field visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', {
        choices: [{ choiceText: 'Go', choiceResponseConstraint: 'strength >= 10', nextNode: 'n2' }],
      }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-533: checkpoint toggle
// ---------------------------------------------------------------------------

describe('OutlineView — checkpoint toggle', () => {
  function expandGameplay(container: HTMLElement, index = 0) {
    const row = expandNode(container, index)
    const gameplayToggle = within(row).getByRole('button', { name: /Gameplay/i })
    fireEvent.click(gameplayToggle)
    return row
  }

  it('renders the Checkpoint checkbox when Gameplay section is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect(screen.getByLabelText('Checkpoint')).toBeTruthy()
  })

  it('is unchecked by default when checkpoint is absent from the node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect((screen.getByLabelText('Checkpoint') as HTMLInputElement).checked).toBe(false)
  })

  it('is checked when checkpoint is true in the document', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect((screen.getByLabelText('Checkpoint') as HTMLInputElement).checked).toBe(true)
  })

  it('commits checkpoint: true to the store when checked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().document[0]?.checkpoint).toBe(true)
  })

  it('commits checkpoint: false to the store when unchecked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().document[0]?.checkpoint).toBe(false)
  })

  it('classifier re-tags the node as isCheckpoint after enabling checkpoint', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect(store.getState().classifierCache.get('n1')?.isCheckpoint).toBe(false)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().classifierCache.get('n1')?.isCheckpoint).toBe(true)
  })

  it('has no axe violations with the checkpoint checkbox visible', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-533: activities array editing
// ---------------------------------------------------------------------------

describe('OutlineView — activities editor: render', () => {
  function expandGameplay(container: HTMLElement, index = 0) {
    const row = expandNode(container, index)
    const gameplayToggle = within(row).getByRole('button', { name: /Gameplay/i })
    fireEvent.click(gameplayToggle)
    return row
  }

  it('renders the Activities fieldset when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect(screen.getByRole('group', { name: 'Activities' })).toBeTruthy()
  })

  it('renders an "Add activity" button', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect(screen.getByRole('button', { name: 'Add activity' })).toBeTruthy()
  })

  it('renders existing activities from the document', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['Roll dice', 'Pick lock'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect((screen.getByLabelText('Activity 1') as HTMLInputElement).value).toBe('Roll dice')
    expect((screen.getByLabelText('Activity 2') as HTMLInputElement).value).toBe('Pick lock')
  })

  it('shows no activity inputs when activities is absent', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    expect(screen.queryByLabelText('Activity 1')).toBeNull()
  })
})

describe('OutlineView — activities editor: add and remove', () => {
  function expandGameplay(container: HTMLElement, index = 0) {
    const row = expandNode(container, index)
    const gameplayToggle = within(row).getByRole('button', { name: /Gameplay/i })
    fireEvent.click(gameplayToggle)
    return row
  }

  it('adds a new activity input when "Add activity" is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))

    expect(screen.getByLabelText('Activity 1')).toBeTruthy()
  })

  it('commits new activity text to the store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    fireEvent.change(screen.getByLabelText('Activity 1'), { target: { value: 'Solve puzzle' } })
    fireEvent.blur(screen.getByLabelText('Activity 1'))

    expect(store.getState().document[0]?.activities).toEqual(['Solve puzzle'])
  })

  it('removes the activity from the store when "Remove activity" is clicked', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['Roll dice', 'Pick lock'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByRole('button', { name: 'Remove activity 1' }))

    expect(store.getState().document[0]?.activities).toEqual(['Pick lock'])
  })

  it('sets activities to undefined when the last entry is removed', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { activities: ['Roll dice'] })])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.click(screen.getByRole('button', { name: 'Remove activity 1' }))

    expect(store.getState().document[0]?.activities).toBeUndefined()
  })
})

describe('OutlineView — activities editor: keyboard reorder', () => {
  function expandGameplay(container: HTMLElement, index = 0) {
    const row = expandNode(container, index)
    const gameplayToggle = within(row).getByRole('button', { name: /Gameplay/i })
    fireEvent.click(gameplayToggle)
    return row
  }

  it('moves an activity up with Alt+ArrowUp', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['First', 'Second'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.keyDown(screen.getByLabelText('Activity 2'), {
      key: 'ArrowUp',
      altKey: true,
    })

    expect(store.getState().document[0]?.activities).toEqual(['Second', 'First'])
  })

  it('moves an activity down with Alt+ArrowDown', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['First', 'Second'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    fireEvent.keyDown(screen.getByLabelText('Activity 1'), {
      key: 'ArrowDown',
      altKey: true,
    })

    expect(store.getState().document[0]?.activities).toEqual(['Second', 'First'])
  })

  it('does not move the first activity up past the beginning', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['Only', 'Second'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    const docBefore = store.getState().document
    fireEvent.keyDown(screen.getByLabelText('Activity 1'), {
      key: 'ArrowUp',
      altKey: true,
    })

    expect(store.getState().document).toBe(docBefore)
  })

  it('does not move the last activity down past the end', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['First', 'Last'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    const docBefore = store.getState().document
    fireEvent.keyDown(screen.getByLabelText('Activity 2'), {
      key: 'ArrowDown',
      altKey: true,
    })

    expect(store.getState().document).toBe(docBefore)
  })

  it('ignores ArrowUp without Alt held', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['First', 'Second'] }),
    ])
    const { container } = renderOutline(store)
    expandGameplay(container)

    const docBefore = store.getState().document
    fireEvent.keyDown(screen.getByLabelText('Activity 2'), { key: 'ArrowUp' })

    expect(store.getState().document).toBe(docBefore)
  })
})

describe('OutlineView — activities editor: accessibility', () => {
  it('has no axe violations with activities visible', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['Roll dice', 'Pick lock'] }),
    ])
    const { container } = renderOutline(store)
    expandAllNodes(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: Accordion expand/collapse (AC2)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: accordion expand/collapse', () => {
  it('renders the header button with aria-expanded="false" initially', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    const button = container.querySelector(
      'ul[aria-label="Adventure outline"] > li > button[aria-expanded]',
    )!
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('sets aria-expanded="true" when the header is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    const row = getNodeRow(container, 0)
    const button = row.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
  })

  it('collapses back to aria-expanded="false" on second click', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    const row = getNodeRow(container, 0)
    const button = row.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('false')
  })

  it('has no axe violations when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'decision' })])
    const { container } = renderOutline(store)
    expandNode(container)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: Stats bar (AC3)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: stats bar', () => {
  it('shows correct counts for nodes, choices, checkpoints, and terminals', async () => {
    // 5 nodes, 3 choices, 2 checkpoints, 1 terminal — all distinct counts
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2', { choices: [makeChoice('n3')] }),
      makeNode('n3', { checkpoint: true }),
      makeNode('n4', { checkpoint: true }),
      makeNode('n5', { node_type: 'end' }),
    ])
    renderOutline(store)

    const statsRegion = screen.getByRole('region', { name: 'Document statistics' })
    expect(within(statsRegion).getByText('5')).toBeTruthy()   // nodes
    expect(within(statsRegion).getByText('3')).toBeTruthy()   // choices
    expect(within(statsRegion).getByText('2')).toBeTruthy()   // checkpoints
    expect(within(statsRegion).getByText('1')).toBeTruthy()   // terminals
    expect(within(statsRegion).getByText('nodes')).toBeTruthy()
    expect(within(statsRegion).getByText('checkpoints')).toBeTruthy()
    expect(within(statsRegion).getByText('terminal')).toBeTruthy()  // singular — 1 terminal
  })

  it('updates the stats bar after a node is added', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    renderOutline(store)

    fireEvent.click(screen.getByRole('button', { name: /Add node/i }))

    const statsRegion = screen.getByRole('region', { name: 'Document statistics' })
    expect(within(statsRegion).getByText('2')).toBeTruthy()
  })

  it('has no axe violations in the stats bar', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: TypeBadge and ClassifierTag in header (AC4)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: node card header badges', () => {
  it('shows the TypeBadge in the collapsed header', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'decision' })])
    const { container } = renderOutline(store)
    const row = getNodeRow(container, 0)
    // Query within the header button only — the hidden body also contains the select option
    const headerButton = row.querySelector('button[aria-expanded]') as HTMLElement
    expect(within(headerButton).getByText('decision')).toBeTruthy()
  })

  it('shows the Orphan ClassifierTag in the collapsed header for an orphan node', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    const { container } = renderOutline(store)
    const orphanRow = getNodeRow(container, 1)
    expect(within(orphanRow).getByText('Orphan')).toBeTruthy()
  })

  it('shows choice count in the collapsed header for non-terminal nodes', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2'),
      makeNode('n3'),
    ])
    const { container } = renderOutline(store)
    const row = getNodeRow(container, 0)
    expect(within(row).getByText('2 choices')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: Delete node with inline confirmation (AC5)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: delete node', () => {
  it('shows inline confirmation prompt when Delete node is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1'), makeNode('n2')])
    const { container } = renderOutline(store)
    expandNode(container, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }))

    expect(screen.getByText('Are you sure?')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy()
  })

  it('removes the node from the document when Confirm is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1'), makeNode('n2')])
    const { container } = renderOutline(store)
    expandNode(container, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(store.getState().document).toHaveLength(1)
    expect(store.getState().document[0]?.id).toBe('n2')
  })

  it('dismisses the confirmation without deleting when Cancel is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1'), makeNode('n2')])
    const { container } = renderOutline(store)
    expandNode(container, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(store.getState().document).toHaveLength(2)
    expect(screen.queryByText('Are you sure?')).toBeNull()
  })

  it('has no axe violations with the delete confirmation visible', async () => {
    const store = await makeStoreWithNodes([makeNode('n1'), makeNode('n2')])
    const { container } = renderOutline(store)
    expandNode(container, 0)

    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: Terminal info box shows node type name (AC6)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: terminal info box', () => {
  it('shows "Terminal node — choices are not permitted on end nodes" for end type', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { node_type: 'end' })])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(screen.getByText(/Terminal node — choices are not permitted on end nodes/i)).toBeTruthy()
  })

  it('shows "Terminal node — choices are not permitted on adventure_success nodes"', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'adventure_success' }),
    ])
    const { container } = renderOutline(store)
    expandNode(container)

    expect(
      screen.getByText(/Terminal node — choices are not permitted on adventure_success nodes/i),
    ).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OPS-540: Add node button (AC7)
// ---------------------------------------------------------------------------

describe('OutlineView — OPS-540: add node', () => {
  it('renders the "+ Add node" button', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    renderOutline(store)

    expect(screen.getByRole('button', { name: /\+ Add node/i })).toBeTruthy()
  })

  it('appends a narrative stub node when "+ Add node" is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    renderOutline(store)

    fireEvent.click(screen.getByRole('button', { name: /\+ Add node/i }))

    expect(store.getState().document).toHaveLength(2)
    const newNode = store.getState().document[1]!
    expect(newNode.node_type).toBe('narrative')
    expect(newNode.title).toBe('New node')
    expect(newNode.choices).toHaveLength(0)
  })

  it('opens the new node accordion and focuses its title field after adding', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)

    fireEvent.click(screen.getByRole('button', { name: /\+ Add node/i }))

    const allButtons = container.querySelectorAll(
      'ul[aria-label="Adventure outline"] > li > button[aria-expanded]',
    )
    const newNodeButton = allButtons[1] as HTMLButtonElement
    expect(newNodeButton.getAttribute('aria-expanded')).toBe('true')

    const focusedElement = container.ownerDocument.activeElement
    expect(focusedElement?.tagName).toBe('INPUT')
    expect((focusedElement as HTMLInputElement).value).toBe('New node')
  })

  it('has no axe violations after adding a node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)

    fireEvent.click(screen.getByRole('button', { name: /\+ Add node/i }))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
