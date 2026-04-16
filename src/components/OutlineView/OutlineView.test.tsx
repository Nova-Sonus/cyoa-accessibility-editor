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

  it('has no axe violations with the issues panel showing structural issues', async () => {
    // An orphan node triggers the issues panel.
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
    // n1 (start) → n2 (narrative): fully connected, 0 initial issues.
    // Transitioning n2 to 'end' with no choices leaves no structural issues.
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'narrative' }),
    ])
    const { container } = renderOutline(store)
    const n2Details = openDetails(container, 1) // open n2's row

    // Scope the query to n2's details to avoid ambiguity with n1's "Node type" select.
    fireEvent.change(within(n2Details).getByLabelText('Node type'), { target: { value: 'end' } })

    // Store cleared choices (none existed); no structural issue remains.
    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// OPS-531: Terminal transition — choices-cleared announcement
// ---------------------------------------------------------------------------

describe('OutlineView — terminal transition choices-cleared announcement', () => {
  it('fires the choices-cleared announce path and surfaces an issue count in the live region', async () => {
    // n1 (start) has 2 choices — the store clears them on terminal transition.
    // Clearing choices makes n1, n2, n3 all orphans (3 new issues), so the
    // debounced count-change announcement ("3 issues found") fires after the
    // choices-cleared announcement — both code paths are exercised.
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2'), makeChoice('n3')] }),
      makeNode('n2', { node_type: 'end' }),
      makeNode('n3', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)
    const n1Details = openDetails(container)

    vi.useFakeTimers()
    try {
      fireEvent.change(within(n1Details).getByLabelText('Node type'), { target: { value: 'end' } })

      await act(async () => { vi.advanceTimersByTime(100) })

      // The count-change announcement wins the debounce: 3 orphan issues created.
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
    openDetails(container)

    // Verify orphan issue is initially present.
    expect(within(screen.getByRole('region', { name: 'Issues' })).getByText(/Orphan node/i)).toBeTruthy()

    // Add a choice from n1 → orphan.
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

    // n2 is deleted — n1's choice now dangles. Wrap in act() so React flushes.
    act(() => {
      store.getState().deleteNode('n2')
    })

    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    expect(within(issuesSection).getByText(/missing node "n2"/i)).toBeTruthy()
  })

  it('removes the dangling issue after the choice nextNode is updated to a valid target', async () => {
    // n1 (start, →n2), n2 (end), n3 (end, initially orphan).
    // After deleting n2 and pointing n1 → n3, n3 gains an incoming edge from the
    // reachable start node — all issues resolve.
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
      makeNode('n3', { node_type: 'end' }),
    ])
    const { container } = renderOutline(store)
    openDetails(container) // open n1 (start) — it owns the choice to fix

    // Delete n2 to create a dangling reference (n3 is also an orphan at this point).
    act(() => {
      store.getState().deleteNode('n2')
    })
    expect(screen.getByRole('region', { name: 'Issues' })).toBeTruthy()

    // Fix the dangling reference: point n1 → n3.
    // n3 now has an incoming edge from the start node — no more orphan or dangling.
    fireEvent.change(screen.getByLabelText('Next node'), { target: { value: 'n3' } })

    expect(screen.getByText(/No issues found/i)).toBeTruthy()
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
// OPS-531: Issues panel — focus activation
// ---------------------------------------------------------------------------

describe('OutlineView — issues panel: focus activation', () => {
  it('opens the node details and focuses the title field when an issue is activated', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ])
    const { container } = renderOutline(store)

    // The issues panel should show the orphan issue.
    const issuesSection = screen.getByRole('region', { name: 'Issues' })
    const activateButton = within(issuesSection).getByRole('button')

    fireEvent.click(activateButton)

    // The orphan node's <details> should now be open.
    const allDetails = container.querySelectorAll(
      'ul[aria-label="Adventure outline"] > li > details',
    )
    // Find the details for 'orphan' (second node).
    const orphanDetails = allDetails[1] as HTMLDetailsElement
    expect(orphanDetails.open).toBe(true)

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
    // Start with a clean document (0 issues) so the count change is 0 → 1.
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    // Replace real setTimeout with fake timers AFTER async store setup.
    vi.useFakeTimers()
    try {
      // Delete n2 — creates a dangling reference (count 0 → 1).
      act(() => {
        store.getState().deleteNode('n2')
      })

      // Advance past the 50 ms debounce so the announcement fires.
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(screen.getByRole('status').textContent).toMatch(/issue/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('announces "No issues" when all issues are resolved', async () => {
    // Start with a clean document (0 issues).
    const store = await makeStoreWithNodes([
      makeNode('n1', { node_type: 'start', choices: [makeChoice('n2')] }),
      makeNode('n2', { node_type: 'end' }),
    ])
    renderOutline(store)

    vi.useFakeTimers()
    try {
      // Delete n2 to introduce a dangling reference (0 → 1 issue).
      act(() => {
        store.getState().deleteNode('n2')
      })
      await act(async () => { vi.advanceTimersByTime(100) })

      // Clear the dangling reference by setting nextNode to '' (1 → 0 issues).
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

// ---------------------------------------------------------------------------
// OPS-532: Audio fields — entry_foley, music, sounds
// ---------------------------------------------------------------------------

describe('OutlineView — audio fields: render', () => {
  it('renders Entry foley, Music, and Ambient sounds inputs when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByLabelText('Entry foley')).toBeTruthy()
    expect(screen.getByLabelText('Music')).toBeTruthy()
    expect(screen.getByLabelText('Ambient sounds')).toBeTruthy()
  })

  it('prepopulates audio fields from the node document', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg', sounds: 'wind.mp3' }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    expect((screen.getByLabelText('Entry foley') as HTMLInputElement).value).toBe('cave.mp3')
    expect((screen.getByLabelText('Music') as HTMLInputElement).value).toBe('theme.ogg')
    expect((screen.getByLabelText('Ambient sounds') as HTMLInputElement).value).toBe('wind.mp3')
  })

  it('shows empty audio inputs when fields are absent from the node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect((screen.getByLabelText('Entry foley') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Music') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Ambient sounds') as HTMLInputElement).value).toBe('')
  })
})

describe('OutlineView — audio fields: commit on blur', () => {
  it('commits entry_foley to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Entry foley'), { target: { value: 'drip.mp3' } })
    fireEvent.blur(screen.getByLabelText('Entry foley'))

    expect(store.getState().document[0]?.entry_foley).toBe('drip.mp3')
  })

  it('commits music to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Music'), { target: { value: 'boss.ogg' } })
    fireEvent.blur(screen.getByLabelText('Music'))

    expect(store.getState().document[0]?.music).toBe('boss.ogg')
  })

  it('commits sounds to store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.change(screen.getByLabelText('Ambient sounds'), { target: { value: 'rain.mp3' } })
    fireEvent.blur(screen.getByLabelText('Ambient sounds'))

    expect(store.getState().document[0]?.sounds).toBe('rain.mp3')
  })

  it('does not dispatch when entry_foley is unchanged on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { entry_foley: 'existing.mp3' })])
    const { container } = renderOutline(store)
    openDetails(container)

    const docBefore = store.getState().document
    fireEvent.blur(screen.getByLabelText('Entry foley'))

    expect(store.getState().document).toBe(docBefore)
  })

  it('clears entry_foley field (sets to undefined) when value is blanked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { entry_foley: 'cave.mp3' })])
    const { container } = renderOutline(store)
    openDetails(container)

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

    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

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

    expect(screen.getByText('theme.ogg')).toBeTruthy()
  })

  it('updates the manifest when an audio field is committed', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByText(/No audio assets referenced/i)).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Music'), { target: { value: 'new_track.ogg' } })
    fireEvent.blur(screen.getByLabelText('Music'))

    expect(screen.getByText('new_track.ogg')).toBeTruthy()
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
    openDetails(container)

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
    openDetails(container)

    expect((screen.getByLabelText('Response constraint') as HTMLInputElement).value).toBe('strength >= 10')
  })

  it('commits choiceResponseConstraint to the store on blur', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { choices: [makeChoice('n2')] }),
      makeNode('n2'),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

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
    openDetails(container)

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
    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-533: checkpoint toggle
// ---------------------------------------------------------------------------

describe('OutlineView — checkpoint toggle', () => {
  it('renders the Checkpoint checkbox when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByLabelText('Checkpoint')).toBeTruthy()
  })

  it('is unchecked by default when checkpoint is absent from the node', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect((screen.getByLabelText('Checkpoint') as HTMLInputElement).checked).toBe(false)
  })

  it('is checked when checkpoint is true in the document', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    openDetails(container)

    expect((screen.getByLabelText('Checkpoint') as HTMLInputElement).checked).toBe(true)
  })

  it('commits checkpoint: true to the store when checked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().document[0]?.checkpoint).toBe(true)
  })

  it('commits checkpoint: false to the store when unchecked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().document[0]?.checkpoint).toBe(false)
  })

  it('classifier re-tags the node as isCheckpoint after enabling checkpoint', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(store.getState().classifierCache.get('n1')?.isCheckpoint).toBe(false)

    fireEvent.click(screen.getByLabelText('Checkpoint'))

    expect(store.getState().classifierCache.get('n1')?.isCheckpoint).toBe(true)
  })

  it('has no axe violations with the checkpoint checkbox visible', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { checkpoint: true })])
    const { container } = renderOutline(store)
    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// OPS-533: activities array editing
// ---------------------------------------------------------------------------

describe('OutlineView — activities editor: render', () => {
  it('renders the Activities fieldset when a node is expanded', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByRole('group', { name: 'Activities' })).toBeTruthy()
  })

  it('renders an "Add activity" button', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.getByRole('button', { name: 'Add activity' })).toBeTruthy()
  })

  it('renders existing activities from the document', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['Roll dice', 'Pick lock'] }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

    expect((screen.getByLabelText('Activity 1') as HTMLInputElement).value).toBe('Roll dice')
    expect((screen.getByLabelText('Activity 2') as HTMLInputElement).value).toBe('Pick lock')
  })

  it('shows no activity inputs when activities is absent', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    expect(screen.queryByLabelText('Activity 1')).toBeNull()
  })
})

describe('OutlineView — activities editor: add and remove', () => {
  it('adds a new activity input when "Add activity" is clicked', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))

    expect(screen.getByLabelText('Activity 1')).toBeTruthy()
  })

  it('commits new activity text to the store on blur', async () => {
    const store = await makeStoreWithNodes([makeNode('n1')])
    const { container } = renderOutline(store)
    openDetails(container)

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
    openDetails(container)

    fireEvent.click(screen.getByRole('button', { name: 'Remove activity 1' }))

    expect(store.getState().document[0]?.activities).toEqual(['Pick lock'])
  })

  it('sets activities to undefined when the last entry is removed', async () => {
    const store = await makeStoreWithNodes([makeNode('n1', { activities: ['Roll dice'] })])
    const { container } = renderOutline(store)
    openDetails(container)

    fireEvent.click(screen.getByRole('button', { name: 'Remove activity 1' }))

    expect(store.getState().document[0]?.activities).toBeUndefined()
  })
})

describe('OutlineView — activities editor: keyboard reorder', () => {
  it('moves an activity up with Alt+ArrowUp', async () => {
    const store = await makeStoreWithNodes([
      makeNode('n1', { activities: ['First', 'Second'] }),
    ])
    const { container } = renderOutline(store)
    openDetails(container)

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
    openDetails(container)

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
    openDetails(container)

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
    openDetails(container)

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
    openDetails(container)

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
    const allDetails = container.querySelectorAll('details')
    allDetails.forEach((d) => ((d as HTMLDetailsElement).open = true))

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
