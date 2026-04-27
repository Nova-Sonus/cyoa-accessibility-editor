import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SpotlightBreadcrumb } from './SpotlightBreadcrumb'
import type { AdventureNode } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeNode(id: string, title: string): AdventureNode {
  return { id, title, node_type: 'narrative', narrativeText: '', choices: [] }
}

const allNodes: AdventureNode[] = [
  makeNode('n1', 'The Cave'),
  makeNode('n2', 'The Bridge'),
  makeNode('n3', 'The Tower'),
]

function renderBreadcrumb(
  breadcrumb: readonly string[],
  opts: {
    onNavigate?: (index: number) => void
    onClear?: () => void
    nodes?: AdventureNode[]
  } = {},
) {
  const onNavigate = opts.onNavigate ?? vi.fn()
  const onClear = opts.onClear ?? vi.fn()
  const nodes = opts.nodes ?? allNodes
  return render(
    <SpotlightBreadcrumb
      breadcrumb={breadcrumb}
      allNodes={nodes}
      onNavigate={onNavigate}
      onClear={onClear}
    />,
  )
}

// ---------------------------------------------------------------------------
// Empty breadcrumb — renders nothing
// ---------------------------------------------------------------------------

describe('SpotlightBreadcrumb — empty', () => {
  it('renders nothing when breadcrumb is empty', () => {
    const { container } = renderBreadcrumb([])
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Single item
// ---------------------------------------------------------------------------

describe('SpotlightBreadcrumb — single item', () => {
  it('renders the node title', () => {
    renderBreadcrumb(['n1'])
    expect(screen.getByText('The Cave')).toBeTruthy()
  })

  it('marks the single item as current via aria-current', () => {
    renderBreadcrumb(['n1'])
    const current = screen.getByText('The Cave')
    expect(current.getAttribute('aria-current')).toBe('true')
  })

  it('renders the Clear spotlight button', () => {
    renderBreadcrumb(['n1'])
    expect(screen.getByRole('button', { name: /Clear spotlight/i })).toBeTruthy()
  })

  it('calls onClear when the dismiss button is clicked', () => {
    const onClear = vi.fn()
    renderBreadcrumb(['n1'], { onClear })
    fireEvent.click(screen.getByRole('button', { name: /Clear spotlight/i }))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('does not render any navigable buttons (only the dismiss button)', () => {
    renderBreadcrumb(['n1'])
    const buttons = screen.getAllByRole('button')
    // Only the dismiss button — current item is a span, not a button
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.getAttribute('aria-label')).toBe('Clear spotlight')
  })
})

// ---------------------------------------------------------------------------
// Multiple items
// ---------------------------------------------------------------------------

describe('SpotlightBreadcrumb — multiple items', () => {
  it('renders all node titles', () => {
    renderBreadcrumb(['n1', 'n2', 'n3'])
    expect(screen.getByText('The Cave')).toBeTruthy()
    expect(screen.getByText('The Bridge')).toBeTruthy()
    expect(screen.getByText('The Tower')).toBeTruthy()
  })

  it('renders separators between items', () => {
    const { container } = renderBreadcrumb(['n1', 'n2', 'n3'])
    const seps = container.querySelectorAll('[aria-hidden="true"]')
    // Two separators for three items
    expect(seps).toHaveLength(2)
  })

  it('prior items are rendered as buttons', () => {
    renderBreadcrumb(['n1', 'n2', 'n3'])
    expect(screen.getByRole('button', { name: 'The Cave' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'The Bridge' })).toBeTruthy()
  })

  it('current (last) item is not a button', () => {
    renderBreadcrumb(['n1', 'n2', 'n3'])
    // 'The Tower' is the last — should not appear as a button
    expect(screen.queryByRole('button', { name: 'The Tower' })).toBeNull()
  })

  it('current item has aria-current="true"', () => {
    renderBreadcrumb(['n1', 'n2', 'n3'])
    const current = screen.getByText('The Tower')
    expect(current.getAttribute('aria-current')).toBe('true')
  })

  it('calls onNavigate with the correct index when a prior item is clicked', () => {
    const onNavigate = vi.fn()
    renderBreadcrumb(['n1', 'n2', 'n3'], { onNavigate })
    fireEvent.click(screen.getByRole('button', { name: 'The Cave' }))
    expect(onNavigate).toHaveBeenCalledWith(0)
  })

  it('calls onNavigate with index 1 for the middle item', () => {
    const onNavigate = vi.fn()
    renderBreadcrumb(['n1', 'n2', 'n3'], { onNavigate })
    fireEvent.click(screen.getByRole('button', { name: 'The Bridge' }))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })
})

// ---------------------------------------------------------------------------
// Title fallback
// ---------------------------------------------------------------------------

describe('SpotlightBreadcrumb — title resolution', () => {
  it('falls back to the node id when allNodes does not contain the id', () => {
    renderBreadcrumb(['unknown-id'])
    expect(screen.getByText('unknown-id')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('SpotlightBreadcrumb — axe-core', () => {
  it('has no violations with a single item', async () => {
    const { container } = renderBreadcrumb(['n1'])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with multiple items', async () => {
    const { container } = renderBreadcrumb(['n1', 'n2', 'n3'])
    expect(await axe(container)).toHaveNoViolations()
  })
})
