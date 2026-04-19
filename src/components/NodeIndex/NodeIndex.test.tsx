import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { NodeIndex } from './NodeIndex'
import type { NodeIndexEntry } from './NodeIndex'

const THREE_NODES: NodeIndexEntry[] = [
  { id: 'n1', title: 'The Beginning', node_type: 'start' },
  { id: 'n2', title: 'A Fork in the Road', node_type: 'decision' },
  { id: 'n3', title: 'The End', node_type: 'end' },
]

const WITH_CHECKPOINT: NodeIndexEntry[] = [
  { id: 'n1', title: 'Save Point', node_type: 'narrative', checkpoint: true },
  { id: 'n2', title: 'No Save', node_type: 'narrative', checkpoint: false },
]

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('NodeIndex — rendering', () => {
  it('renders a nav with aria-label="Node index"', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    expect(screen.getByRole('navigation', { name: 'Node index' })).toBeTruthy()
  })

  it('renders one button per node', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('renders node titles as button text', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    expect(screen.getByText('The Beginning')).toBeTruthy()
    expect(screen.getByText('A Fork in the Road')).toBeTruthy()
    expect(screen.getByText('The End')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    const { container } = render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// AC2 — onActivate called with correct nodeId
// ---------------------------------------------------------------------------

describe('NodeIndex — activation (AC2)', () => {
  it('calls onActivate with the nodeId when first button is clicked', () => {
    const onActivate = vi.fn()
    render(<NodeIndex nodes={THREE_NODES} onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0]!)
    expect(onActivate).toHaveBeenCalledWith('n1')
  })

  it('calls onActivate with the nodeId of the second button when clicked', () => {
    const onActivate = vi.fn()
    render(<NodeIndex nodes={THREE_NODES} onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]!)
    expect(onActivate).toHaveBeenCalledWith('n2')
  })
})

// ---------------------------------------------------------------------------
// AC3 — arrow key navigation
// ---------------------------------------------------------------------------

describe('NodeIndex — keyboard navigation (AC3)', () => {
  it('ArrowDown moves focus from first to second button', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    buttons[0]!.focus()
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1])
  })

  it('ArrowUp moves focus from second to first button', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    buttons[1]!.focus()
    fireEvent.keyDown(buttons[1]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('ArrowDown on last button does nothing', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    buttons[2]!.focus()
    fireEvent.keyDown(buttons[2]!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[2])
  })

  it('ArrowUp on first button does nothing', () => {
    render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    buttons[0]!.focus()
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('has no axe violations after arrow key interaction', async () => {
    const { container } = render(<NodeIndex nodes={THREE_NODES} onActivate={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

// ---------------------------------------------------------------------------
// AC6 — checkpoint indicator
// ---------------------------------------------------------------------------

describe('NodeIndex — checkpoint indicator (AC6)', () => {
  it('renders a checkpoint indicator for a node with checkpoint: true', () => {
    const { container } = render(<NodeIndex nodes={WITH_CHECKPOINT} onActivate={vi.fn()} />)
    expect(container.querySelectorAll('[data-testid="checkpoint-indicator"]')).toHaveLength(1)
  })

  it('does not render a checkpoint indicator for a node with checkpoint: false', () => {
    const { container } = render(
      <NodeIndex nodes={[{ id: 'n1', title: 'No Save', node_type: 'narrative', checkpoint: false }]} onActivate={vi.fn()} />,
    )
    expect(container.querySelectorAll('[data-testid="checkpoint-indicator"]')).toHaveLength(0)
  })

  it('has no axe violations with checkpoint entries', async () => {
    const { container } = render(<NodeIndex nodes={WITH_CHECKPOINT} onActivate={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
