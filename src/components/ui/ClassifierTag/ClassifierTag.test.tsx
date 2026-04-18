import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { ClassifierTag } from './ClassifierTag'
import { CLASSIFIER_BADGES } from '../../../styles/tokens'
import type { ClassifierTagKey } from '../../../styles/tokens'

const ALL_TAGS: ClassifierTagKey[] = [
  'orphan', 'unreachable', 'junction', 'branch', 'linear_link', 'checkpoint',
]

describe('ClassifierTag', () => {
  it('renders the label for the orphan tag', () => {
    render(<ClassifierTag tag="orphan" />)
    expect(screen.getByText('Orphan')).toBeInTheDocument()
  })

  it('renders the label for the unreachable tag', () => {
    render(<ClassifierTag tag="unreachable" />)
    expect(screen.getByText('Unreachable')).toBeInTheDocument()
  })

  it('renders the label for checkpoint', () => {
    render(<ClassifierTag tag="checkpoint" />)
    expect(screen.getByText('Checkpoint')).toBeInTheDocument()
  })

  it('sets CSS custom properties from the token', () => {
    const { container } = render(<ClassifierTag tag="orphan" />)
    const span = container.querySelector('span')
    expect(span?.style.getPropertyValue('--tag-bg')).toBe('#fef2f2')
    expect(span?.style.getPropertyValue('--tag-fg')).toBe('#991b1b')
    expect(span?.style.getPropertyValue('--tag-border')).toBe('#fecaca')
  })

  it('has zero axe violations — orphan badge', async () => {
    const { container } = render(
      <div>
        <ClassifierTag tag="orphan" />
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero axe violations for all tags', async () => {
    const { container } = render(
      <div>
        {ALL_TAGS.map((tag) => (
          <ClassifierTag key={tag} tag={tag} />
        ))}
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

// AC5 — CLASSIFIER_BADGES completeness
describe('CLASSIFIER_BADGES — token completeness', () => {
  it('has all required colour properties for every classifier tag', () => {
    for (const tag of ALL_TAGS) {
      const cfg = CLASSIFIER_BADGES[tag]
      expect(cfg, `CLASSIFIER_BADGES["${tag}"]`).toBeDefined()
      expect(typeof cfg.label).toBe('string')
      expect(typeof cfg.bg).toBe('string')
      expect(typeof cfg.fg).toBe('string')
      expect(typeof cfg.border).toBe('string')
      expect(cfg.label.length, `label for ${tag}`).toBeGreaterThan(0)
      expect(cfg.bg.length, `bg for ${tag}`).toBeGreaterThan(0)
      expect(cfg.fg.length, `fg for ${tag}`).toBeGreaterThan(0)
      expect(cfg.border.length, `border for ${tag}`).toBeGreaterThan(0)
    }
  })

  it('covers all 6 classifier tags', () => {
    expect(Object.keys(CLASSIFIER_BADGES)).toHaveLength(6)
  })
})
