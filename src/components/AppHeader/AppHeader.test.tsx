import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import { AppHeader } from './AppHeader'

function renderHeader(activeView: 'outline' | 'canvas' = 'outline', onViewChange = vi.fn(), onNewAdventure = vi.fn()) {
  return render(
    <AppHeader
      activeView={activeView}
      onViewChange={onViewChange}
      onNewAdventure={onNewAdventure}
    />,
  )
}

// AC1 — tablist structure is correct
describe('AppHeader — tablist structure (AC1)', () => {
  it('renders a tablist with two tabs labelled Outline and Canvas', () => {
    renderHeader()
    const tablist = screen.getByRole('tablist', { name: 'View mode' })
    const tabs = within(tablist).getAllByRole('tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]).toHaveAccessibleName('Outline')
    expect(tabs[1]).toHaveAccessibleName('Canvas')
  })

  it('sets aria-selected=true on the active tab and false on the other', () => {
    renderHeader('outline')
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('aria-selected', 'false')
  })

  it('puts tabIndex=0 on active tab and -1 on inactive tab', () => {
    renderHeader('canvas')
    expect(screen.getByRole('tab', { name: 'Outline' })).toHaveAttribute('tabIndex', '-1')
    expect(screen.getByRole('tab', { name: 'Canvas' })).toHaveAttribute('tabIndex', '0')
  })

  it('each tab has aria-controls pointing at a panel id', () => {
    renderHeader()
    const outlineTab = screen.getByRole('tab', { name: 'Outline' })
    const canvasTab  = screen.getByRole('tab', { name: 'Canvas' })
    expect(outlineTab).toHaveAttribute('aria-controls', 'panel-outline')
    expect(canvasTab).toHaveAttribute('aria-controls', 'panel-canvas')
  })

  it('has zero axe violations', async () => {
    // aria-controls must reference elements in the DOM, so we wrap with panels.
    const { container } = render(
      <div>
        <AppHeader activeView="outline" onViewChange={vi.fn()} onNewAdventure={vi.fn()} />
        <div role="tabpanel" id="panel-outline" aria-labelledby="tab-outline" />
        <div role="tabpanel" id="panel-canvas" aria-labelledby="tab-canvas" hidden />
      </div>,
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

// AC2 — arrow key navigation moves focus and fires onViewChange
describe('AppHeader — arrow key navigation (AC2)', () => {
  it('ArrowRight on Outline tab calls onViewChange with canvas', () => {
    const onViewChange = vi.fn()
    renderHeader('outline', onViewChange)
    const outlineTab = screen.getByRole('tab', { name: 'Outline' })
    fireEvent.keyDown(outlineTab, { key: 'ArrowRight' })
    expect(onViewChange).toHaveBeenCalledWith('canvas')
  })

  it('ArrowLeft on Canvas tab calls onViewChange with outline', () => {
    const onViewChange = vi.fn()
    renderHeader('canvas', onViewChange)
    const canvasTab = screen.getByRole('tab', { name: 'Canvas' })
    fireEvent.keyDown(canvasTab, { key: 'ArrowLeft' })
    expect(onViewChange).toHaveBeenCalledWith('outline')
  })

  it('ArrowLeft on Outline tab wraps to canvas', () => {
    const onViewChange = vi.fn()
    renderHeader('outline', onViewChange)
    const outlineTab = screen.getByRole('tab', { name: 'Outline' })
    fireEvent.keyDown(outlineTab, { key: 'ArrowLeft' })
    expect(onViewChange).toHaveBeenCalledWith('canvas')
  })

  it('ArrowRight on Canvas tab wraps to outline', () => {
    const onViewChange = vi.fn()
    renderHeader('canvas', onViewChange)
    const canvasTab = screen.getByRole('tab', { name: 'Canvas' })
    fireEvent.keyDown(canvasTab, { key: 'ArrowRight' })
    expect(onViewChange).toHaveBeenCalledWith('outline')
  })
})

// AC5 — "New adventure" button
describe('AppHeader — New adventure button (AC5)', () => {
  it('calls onNewAdventure when clicked', () => {
    const onNewAdventure = vi.fn()
    renderHeader('outline', vi.fn(), onNewAdventure)
    fireEvent.click(screen.getByRole('button', { name: 'New adventure' }))
    expect(onNewAdventure).toHaveBeenCalledOnce()
  })
})

// AC6 — "Open" button is rendered
describe('AppHeader — Open button (AC6)', () => {
  it('renders an Open button', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })
})

// AC6 — clicking a tab calls onViewChange
describe('AppHeader — tab click', () => {
  it('clicking Canvas tab calls onViewChange with canvas', () => {
    const onViewChange = vi.fn()
    renderHeader('outline', onViewChange)
    fireEvent.click(screen.getByRole('tab', { name: 'Canvas' }))
    expect(onViewChange).toHaveBeenCalledWith('canvas')
  })
})
