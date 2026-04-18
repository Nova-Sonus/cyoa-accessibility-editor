import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { FieldGroup } from './FieldGroup'

describe('FieldGroup', () => {
  it('renders the label', () => {
    render(<FieldGroup label="Audio"><p>content</p></FieldGroup>)
    expect(screen.getByText('Audio')).toBeInTheDocument()
  })

  it('is open by default', () => {
    render(<FieldGroup label="Audio"><p>child content</p></FieldGroup>)
    const button = screen.getByRole('button', { name: /audio/i })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('child content')).toBeVisible()
  })

  it('is closed when defaultOpen={false}', () => {
    render(
      <FieldGroup label="Audio" defaultOpen={false}>
        <p>child content</p>
      </FieldGroup>,
    )
    const button = screen.getByRole('button', { name: /audio/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('toggles aria-expanded from false to true on activation — AC3', async () => {
    const user = userEvent.setup()
    render(
      <FieldGroup label="Audio" defaultOpen={false}>
        <p>child content</p>
      </FieldGroup>,
    )
    const button = screen.getByRole('button', { name: /audio/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses when activated again', async () => {
    const user = userEvent.setup()
    render(
      <FieldGroup label="Audio" defaultOpen={true}>
        <p>child content</p>
      </FieldGroup>,
    )
    const button = screen.getByRole('button', { name: /audio/i })
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders icon when provided', () => {
    render(<FieldGroup label="Audio" icon="🎵"><p>content</p></FieldGroup>)
    expect(screen.getByText('🎵')).toBeInTheDocument()
  })

  it('has zero axe violations when open — AC3', async () => {
    const { container } = render(
      <FieldGroup label="Audio" defaultOpen={true}>
        <p>child content</p>
      </FieldGroup>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has zero axe violations when closed', async () => {
    const { container } = render(
      <FieldGroup label="Audio" defaultOpen={false}>
        <p>child content</p>
      </FieldGroup>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
