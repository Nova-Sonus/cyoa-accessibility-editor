import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { TypeBadge } from './TypeBadge'
import { NODE_COLOURS } from '../../../styles/tokens'
import type { NodeType } from '../../../types/adventure'

const ALL_NODE_TYPES: NodeType[] = [
  'start', 'scene_start', 'decision', 'narrative',
  'combat', 'puzzle', 'end', 'adventure_success',
]

describe('TypeBadge', () => {
  it('renders the node type as human-readable text', () => {
    render(<TypeBadge type="combat" />)
    expect(screen.getByText('combat')).toBeInTheDocument()
  })

  it('replaces underscores with spaces', () => {
    render(<TypeBadge type="adventure_success" />)
    expect(screen.getByText('adventure success')).toBeInTheDocument()
  })

  it('renders scene_start with spaces', () => {
    render(<TypeBadge type="scene_start" />)
    expect(screen.getByText('scene start')).toBeInTheDocument()
  })

  it('sets --badge-bg CSS custom property from the token', () => {
    const { container } = render(<TypeBadge type="combat" />)
    const span = container.querySelector('span')
    expect(span?.style.getPropertyValue('--badge-bg')).toBe('#d97706')
  })

  it('has zero axe violations', async () => {
    const { container } = render(
      <div>
        <TypeBadge type="combat" />
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// AC5 — token completeness
describe('NODE_COLOURS — token completeness', () => {
  it('has all required colour properties for every node type', () => {
    for (const type of ALL_NODE_TYPES) {
      const colours = NODE_COLOURS[type]
      expect(colours, `NODE_COLOURS["${type}"]`).toBeDefined()
      expect(typeof colours.border).toBe('string')
      expect(typeof colours.bg).toBe('string')
      expect(typeof colours.badge).toBe('string')
      expect(typeof colours.text).toBe('string')
      expect(colours.border.length, `border for ${type}`).toBeGreaterThan(0)
      expect(colours.bg.length, `bg for ${type}`).toBeGreaterThan(0)
      expect(colours.badge.length, `badge for ${type}`).toBeGreaterThan(0)
      expect(colours.text.length, `text for ${type}`).toBeGreaterThan(0)
    }
  })

  it('covers all 8 node types', () => {
    expect(Object.keys(NODE_COLOURS)).toHaveLength(8)
  })
})
