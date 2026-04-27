import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { MiniNode } from './MiniNode'
import type { AdventureNode } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id: 'n1',
    title: 'Test Node',
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

function makeTags(overrides: Partial<ClassifierTags> = {}): ClassifierTags {
  return {
    isOrphan: false,
    isTerminal: false,
    isJunction: false,
    isBranch: false,
    isLinearLink: false,
    isCheckpoint: false,
    unreachable: false,
    sceneId: null,
    depth: 0,
    ...overrides,
  }
}

function renderNode(
  overrides: Partial<AdventureNode> = {},
  tags: Partial<ClassifierTags> = {},
  props: Partial<{ spotlightState: 'focus' | 'neighbour' | 'dimmed' | 'normal'; onActivate: (id: string) => void }> = {},
) {
  const onActivate = props.onActivate ?? vi.fn()
  return render(
    <MiniNode
      node={makeNode(overrides)}
      tags={makeTags(tags)}
      spotlightState={props.spotlightState}
      onActivate={onActivate}
    />,
  )
}

// ---------------------------------------------------------------------------
// Rendering and accessible label
// ---------------------------------------------------------------------------

describe('MiniNode — rendering', () => {
  it('renders a button', () => {
    renderNode()
    expect(screen.getByRole('button')).toBeTruthy()
  })

  it('aria-label includes node title and type', () => {
    renderNode()
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-label')).toContain('Test Node')
    expect(btn.getAttribute('aria-label')).toContain('narrative')
  })

  it('aria-label includes checkpoint qualifier', () => {
    renderNode({}, { isCheckpoint: true })
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('checkpoint')
  })

  it('aria-label includes orphan qualifier', () => {
    renderNode({}, { isOrphan: true })
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('orphan')
  })

  it('aria-label includes unreachable qualifier', () => {
    renderNode({}, { unreachable: true })
    expect(screen.getByRole('button').getAttribute('aria-label')).toContain('unreachable')
  })

  it('renders checkpoint bar when isCheckpoint is true', () => {
    const { container } = renderNode({}, { isCheckpoint: true })
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy()
  })

  it('calls onActivate with node id when clicked', () => {
    const onActivate = vi.fn()
    renderNode({ id: 'abc' }, {}, { onActivate })
    fireEvent.click(screen.getByRole('button'))
    expect(onActivate).toHaveBeenCalledWith('abc')
  })
})

// ---------------------------------------------------------------------------
// Spotlight state — data attribute
// ---------------------------------------------------------------------------

describe('MiniNode — spotlightState data attribute', () => {
  it('has no data-spotlight attribute when state is normal', () => {
    renderNode({}, {}, { spotlightState: 'normal' })
    const btn = screen.getByRole('button')
    expect(btn.hasAttribute('data-spotlight')).toBe(false)
  })

  it('has no data-spotlight attribute when spotlightState is omitted (defaults to normal)', () => {
    renderNode()
    expect(screen.getByRole('button').hasAttribute('data-spotlight')).toBe(false)
  })

  it('sets data-spotlight="focus" for focus state', () => {
    renderNode({}, {}, { spotlightState: 'focus' })
    expect(screen.getByRole('button').getAttribute('data-spotlight')).toBe('focus')
  })

  it('sets data-spotlight="neighbour" for neighbour state', () => {
    renderNode({}, {}, { spotlightState: 'neighbour' })
    expect(screen.getByRole('button').getAttribute('data-spotlight')).toBe('neighbour')
  })

  it('sets data-spotlight="dimmed" for dimmed state', () => {
    renderNode({}, {}, { spotlightState: 'dimmed' })
    expect(screen.getByRole('button').getAttribute('data-spotlight')).toBe('dimmed')
  })
})

// ---------------------------------------------------------------------------
// Spotlight state — CSS class presence
// ---------------------------------------------------------------------------

describe('MiniNode — spotlightState CSS classes', () => {
  it('does not apply a spotlight class for normal state', () => {
    const { container } = renderNode({}, {}, { spotlightState: 'normal' })
    const btn = container.querySelector('button')!
    expect(btn.className).not.toContain('spotlight')
  })

  it('applies spotlightFocus class for focus state', () => {
    const { container } = renderNode({}, {}, { spotlightState: 'focus' })
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('spotlightFocus')
  })

  it('applies spotlightNeighbour class for neighbour state', () => {
    const { container } = renderNode({}, {}, { spotlightState: 'neighbour' })
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('spotlightNeighbour')
  })

  it('applies spotlightDimmed class for dimmed state', () => {
    const { container } = renderNode({}, {}, { spotlightState: 'dimmed' })
    const btn = container.querySelector('button')!
    expect(btn.className).toContain('spotlightDimmed')
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('MiniNode — axe-core', () => {
  it('has no violations in normal state', async () => {
    const { container } = renderNode()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in focus state', async () => {
    const { container } = renderNode({}, {}, { spotlightState: 'focus' })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in neighbour state', async () => {
    const { container } = renderNode({}, {}, { spotlightState: 'neighbour' })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations in dimmed state', async () => {
    const { container } = renderNode({}, {}, { spotlightState: 'dimmed' })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with checkpoint bar', async () => {
    const { container } = renderNode({}, { isCheckpoint: true })
    expect(await axe(container)).toHaveNoViolations()
  })
})
