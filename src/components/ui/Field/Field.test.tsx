import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { Field } from './Field'

describe('Field', () => {
  it('renders a label', () => {
    render(<Field label="Title" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
  })

  it('renders an input for short text', () => {
    render(<Field label="Title" value="short" onChange={() => {}} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Title' })).toBeInTheDocument()
  })

  it('renders a textarea when value exceeds 80 characters', () => {
    const longValue = 'a'.repeat(81)
    render(<Field label="Narrative" value={longValue} onChange={() => {}} />)
    const el = screen.getByLabelText('Narrative')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('renders a textarea when large prop is set', () => {
    render(<Field label="Narrative" value="short" large onChange={() => {}} />)
    const el = screen.getByLabelText('Narrative')
    expect(el.tagName).toBe('TEXTAREA')
  })

  it('renders an input when value is exactly 80 characters', () => {
    const value = 'a'.repeat(80)
    render(<Field label="Title" value={value} onChange={() => {}} />)
    const el = screen.getByLabelText('Title')
    expect(el.tagName).toBe('INPUT')
  })

  it('calls onChange when user types', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    render(<Field label="Title" value="" onChange={(v) => calls.push(v)} />)
    await user.type(screen.getByRole('textbox'), 'hello')
    expect(calls.length).toBeGreaterThan(0)
  })

  it('is disabled when disabled prop is set', () => {
    render(<Field label="Title" value="x" onChange={() => {}} disabled />)
    expect(screen.getByRole('textbox')).toBeDisabled()
  })

  it('has zero axe violations — input', async () => {
    const { container } = render(<Field label="Title" value="short" onChange={() => {}} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero axe violations — textarea', async () => {
    const { container } = render(
      <Field label="Narrative" value={'a'.repeat(81)} onChange={() => {}} />,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
