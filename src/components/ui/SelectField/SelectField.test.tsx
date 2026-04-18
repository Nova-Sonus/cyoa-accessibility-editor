import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { SelectField } from './SelectField'

describe('SelectField', () => {
  const options = ['start', 'decision', 'narrative', 'end']

  it('renders a labelled select', () => {
    render(<SelectField label="Node type" value="narrative" options={options} onChange={() => {}} />)
    expect(screen.getByLabelText('Node type')).toBeInTheDocument()
  })

  it('renders all options', () => {
    render(<SelectField label="Node type" value="narrative" options={options} onChange={() => {}} />)
    expect(screen.getByRole('option', { name: 'start' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'decision' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'narrative' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'end' })).toBeInTheDocument()
  })

  it('calls onChange when selection changes', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    render(
      <SelectField
        label="Node type"
        value="narrative"
        options={options}
        onChange={(v) => calls.push(v)}
      />,
    )
    await user.selectOptions(screen.getByRole('combobox'), 'end')
    expect(calls).toContain('end')
  })

  it('is disabled when disabled prop is set', () => {
    render(
      <SelectField label="Node type" value="narrative" options={options} onChange={() => {}} disabled />,
    )
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('replaces underscores in option labels', () => {
    render(
      <SelectField
        label="Type"
        value="adventure_success"
        options={['adventure_success']}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('option', { name: 'adventure success' })).toBeInTheDocument()
  })

  it('has zero axe violations', async () => {
    const { container } = render(
      <SelectField label="Node type" value="narrative" options={options} onChange={() => {}} />,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
