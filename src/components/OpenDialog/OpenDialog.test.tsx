import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { OpenDialog } from './OpenDialog'
import type { AdventureMetadata } from '../../types/adventure'

// jsdom does not implement HTMLDialogElement.showModal / close.
// Provide minimal stubs so the component's useEffect doesn't throw.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

const sampleMetadata: AdventureMetadata[] = [
  { id: 'id-1', title: 'Cave of Wonders', savedAt: '2026-04-18T12:00:00.000Z' },
  { id: 'id-2', title: 'A Strange Day', savedAt: '2026-04-17T09:30:00.000Z' },
]

function renderDialog(
  props: Partial<Parameters<typeof OpenDialog>[0]> = {},
) {
  const defaults = {
    isOpen: true,
    metadata: sampleMetadata,
    onSelect: vi.fn(),
    onClose: vi.fn(),
  }
  return render(<OpenDialog {...defaults} {...props} />)
}

describe('OpenDialog', () => {
  it('renders the heading', () => {
    renderDialog()
    expect(screen.getByRole('heading', { name: 'Open adventure' })).toBeDefined()
  })

  it('renders each adventure title', () => {
    renderDialog()
    expect(screen.getByText('Cave of Wonders')).toBeDefined()
    expect(screen.getByText('A Strange Day')).toBeDefined()
  })

  it('renders an Open button for each adventure', () => {
    renderDialog()
    expect(screen.getAllByRole('button', { name: 'Open' })).toHaveLength(2)
  })

  it('calls onSelect with the correct id when Open is clicked', () => {
    const onSelect = vi.fn()
    renderDialog({ onSelect })
    const buttons = screen.getAllByRole('button', { name: 'Open' })
    fireEvent.click(buttons[0]!)
    expect(onSelect).toHaveBeenCalledWith('id-1')
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows empty message when no metadata', () => {
    renderDialog({ metadata: [] })
    expect(screen.getByText('No saved adventures found.')).toBeDefined()
  })

  it('does not render adventure list when empty', () => {
    renderDialog({ metadata: [] })
    expect(screen.queryAllByRole('button', { name: 'Open' })).toHaveLength(0)
  })

  it('calls showModal when opened', () => {
    renderDialog({ isOpen: true })
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled()
  })

  it('has no axe violations when open with metadata', async () => {
    const { container } = renderDialog()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations when empty', async () => {
    const { container } = renderDialog({ metadata: [] })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
