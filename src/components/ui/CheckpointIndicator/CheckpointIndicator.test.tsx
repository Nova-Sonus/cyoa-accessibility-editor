import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { CheckpointIndicator } from './CheckpointIndicator'

describe('CheckpointIndicator', () => {
  it('renders the text "Checkpoint"', () => {
    render(<CheckpointIndicator />)
    expect(screen.getByText('Checkpoint')).toBeInTheDocument()
  })

  it('has zero axe violations', async () => {
    const { container } = render(
      <div>
        <CheckpointIndicator />
      </div>,
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
