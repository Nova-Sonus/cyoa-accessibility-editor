import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { ComboField } from './ComboField'

const suggestions = ['footsteps_gravel', 'gate_creak', 'bramble_rustle', 'wind_howl']

describe('ComboField', () => {
  it('renders a labelled input', () => {
    render(<ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />)
    expect(screen.getByLabelText('Sound')).toBeInTheDocument()
  })

  it('input has role="combobox"', () => {
    render(<ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('filters suggestions by typed text — AC4', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn((v: string) => v)
    const { rerender } = render(
      <ComboField label="Sound" value="" onChange={onChange} suggestions={suggestions} />,
    )
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.type(input, 'gate')
    // simulate controlled update
    rerender(
      <ComboField label="Sound" value="gate" onChange={onChange} suggestions={suggestions} />,
    )
    expect(screen.getByRole('option', { name: 'gate_creak' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'footsteps_gravel' })).not.toBeInTheDocument()
  })

  it('aria-expanded is true when listbox is open — AC4', async () => {
    const user = userEvent.setup()
    render(<ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the listbox on Escape', async () => {
    const user = userEvent.setup()
    render(<ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('selects option with keyboard Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <ComboField label="Sound" value="" onChange={onChange} suggestions={suggestions} />,
    )
    const input = screen.getByRole('combobox')
    await user.click(input)
    rerender(<ComboField label="Sound" value="" onChange={onChange} suggestions={suggestions} />)
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith(suggestions[0])
  })

  it('selects option on click', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <ComboField label="Sound" value="" onChange={onChange} suggestions={suggestions} />,
    )
    const input = screen.getByRole('combobox')
    await user.click(input)
    const option = screen.getByRole('option', { name: 'footsteps_gravel' })
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith('footsteps_gravel')
  })

  it('has zero axe violations when closed — AC4', async () => {
    const { container } = render(
      <ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero axe violations when open — AC4', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ComboField label="Sound" value="" onChange={() => {}} suggestions={suggestions} />,
    )
    await user.click(screen.getByRole('combobox'))
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
