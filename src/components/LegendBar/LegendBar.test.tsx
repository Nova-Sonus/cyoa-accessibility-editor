import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
import { LegendBar } from './LegendBar'
import { NODE_COLOURS, CLASSIFIER_BADGES } from '../../styles/tokens'

describe('LegendBar — AC4', () => {
  it('renders all 8 node-type swatches', () => {
    const { container } = render(<LegendBar />)
    const bar = container.firstChild as HTMLElement
    // Should contain text for every node type label
    const labels = ['Start', 'Scene start', 'Decision', 'Narrative', 'Combat', 'Puzzle', 'End', 'Success']
    for (const label of labels) {
      expect(bar.textContent).toContain(label)
    }
  })

  it('renders all 6 classifier tag swatches', () => {
    const { container } = render(<LegendBar />)
    const bar = container.firstChild as HTMLElement
    for (const badge of Object.values(CLASSIFIER_BADGES)) {
      expect(bar.textContent).toContain(badge.label)
    }
  })

  it('covers exactly 8 node types from the token map', () => {
    expect(Object.keys(NODE_COLOURS)).toHaveLength(8)
  })

  it('covers exactly 6 classifier tags from the token map', () => {
    expect(Object.keys(CLASSIFIER_BADGES)).toHaveLength(6)
  })

  it('has aria-hidden=true on the container', () => {
    const { container } = render(<LegendBar />)
    const bar = container.firstChild as HTMLElement
    expect(bar).toHaveAttribute('aria-hidden', 'true')
  })

  it('contains no focusable elements', () => {
    const { container } = render(<LegendBar />)
    const focusable = container.querySelectorAll(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    expect(focusable).toHaveLength(0)
  })

  it('has zero axe violations', async () => {
    const { container } = render(<LegendBar />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
