import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { SceneLane } from './SceneLane'
import { classifyAll } from '../../classifier'
import type { Adventure, AdventureNode } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

function ch(nextNode: string, choiceText = `go to ${nextNode}`) {
  return { choiceText, choiceResponseConstraint: '', nextNode }
}

// ---------------------------------------------------------------------------
// Adventure fixture:
//
//   start → sceneA (scene_start, "Act One") → n1 (checkpoint) → n2
//   n2 → sceneB (scene_start, "Act Two") → n3
//
// Classifier results:
//   start: sceneId=null
//   sceneA: sceneId=null  (scene_start inherits parent)
//   n1: sceneId='sceneA'
//   n2: sceneId='sceneA'
//   sceneB: sceneId='sceneA'  (scene_start inherits parent node n2)
//   n3: sceneId='sceneB'
// ---------------------------------------------------------------------------

const adventure: Adventure = [
  makeNode('start', { node_type: 'start', choices: [ch('sceneA')] }),
  makeNode('sceneA', { node_type: 'scene_start', title: 'Act One', choices: [ch('n1')] }),
  makeNode('n1', { node_type: 'narrative', checkpoint: true, choices: [ch('n2')] }),
  makeNode('n2', { node_type: 'decision', choices: [ch('sceneB')] }),
  makeNode('sceneB', { node_type: 'scene_start', title: 'Act Two', choices: [ch('n3')] }),
  makeNode('n3', { node_type: 'end' }),
]

const cache = classifyAll(adventure)

// Nodes whose sceneId === 'sceneA'
const sceneANodes = adventure.filter((n) => cache.get(n.id)?.sceneId === 'sceneA')
// Nodes whose sceneId === 'sceneB'
const sceneBNodes = adventure.filter((n) => cache.get(n.id)?.sceneId === 'sceneB')

// ---------------------------------------------------------------------------
// Default render helper
// ---------------------------------------------------------------------------

function renderLane(props: {
  sceneId?: string
  nodes?: AdventureNode[]
  spotlightNodeIds?: ReadonlySet<string> | null
  focusNodeId?: string | null
  onNodeActivate?: (id: string) => void
}) {
  const {
    sceneId = 'sceneA',
    nodes = sceneANodes,
    spotlightNodeIds = null,
    focusNodeId = null,
    onNodeActivate = vi.fn(),
  } = props
  return render(
    <SceneLane
      sceneId={sceneId}
      nodes={nodes}
      allNodes={adventure}
      classifierCache={cache}
      spotlightNodeIds={spotlightNodeIds}
      focusNodeId={focusNodeId}
      onNodeActivate={onNodeActivate}
    />,
  )
}

// ---------------------------------------------------------------------------
// Header content
// ---------------------------------------------------------------------------

describe('SceneLane — header', () => {
  it('shows the scene title from the scene_start node', () => {
    renderLane({})
    expect(screen.getByText('Act One')).toBeTruthy()
  })

  it('shows the node count', () => {
    renderLane({})
    // sceneA contains n1, n2, sceneB → 3 nodes
    expect(screen.getByText(/3 nodes/i)).toBeTruthy()
  })

  it('shows "node" (singular) when there is only one node', () => {
    renderLane({ nodes: [sceneANodes[0]!] })
    expect(screen.getByText(/1 node\b/i)).toBeTruthy()
  })

  it('shows checkpoint count when there are checkpoints', () => {
    renderLane({})
    // n1 is a checkpoint
    expect(screen.getByText(/✓ 1/)).toBeTruthy()
  })

  it('hides checkpoint badge when no checkpoints', () => {
    const noCheckpoints = sceneANodes.filter((n) => !cache.get(n.id)?.isCheckpoint)
    renderLane({ nodes: noCheckpoints })
    expect(screen.queryByText(/✓/)).toBeNull()
  })

  it('shows outbound flow indicator for scenes that this scene flows into', () => {
    // sceneA (via n2 → sceneB) flows outbound to sceneB
    renderLane({})
    expect(screen.getByText(/→ Act Two/)).toBeTruthy()
  })

  it('shows inbound flow indicator for scenes that flow into this scene', () => {
    renderLane({ sceneId: 'sceneB', nodes: sceneBNodes })
    // sceneB receives from sceneA
    expect(screen.getByText(/← Act One/)).toBeTruthy()
  })

  it('falls back to sceneId when scene_start node is not found', () => {
    renderLane({ sceneId: 'unknown-scene', nodes: [] })
    expect(screen.getByText('unknown-scene')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Collapse / expand
// ---------------------------------------------------------------------------

describe('SceneLane — collapse / expand', () => {
  it('renders node body by default (expanded)', () => {
    renderLane({})
    // n1 MiniNode button should be present
    const btn = screen.getByRole('button', { name: /Node n1/i })
    expect(btn).toBeTruthy()
  })

  it('hides body after clicking the header', () => {
    renderLane({})
    const toggleBtn = document.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(toggleBtn)
    expect(screen.queryByRole('button', { name: /Node n1/i })).toBeNull()
  })

  it('sets aria-expanded="true" when expanded', () => {
    renderLane({})
    const toggleBtn = document.querySelector('button[aria-expanded]') as HTMLButtonElement
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true')
  })

  it('sets aria-expanded="false" after collapsing', () => {
    renderLane({})
    const toggleBtn = document.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(toggleBtn)
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false')
  })

  it('restores body after collapsing then expanding', () => {
    renderLane({})
    const toggleBtn = document.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(toggleBtn)
    fireEvent.click(toggleBtn)
    expect(screen.getByRole('button', { name: /Node n1/i })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Spotlight ring
// ---------------------------------------------------------------------------

describe('SceneLane — spotlight', () => {
  it('adds data-spotlighted attribute when a lane node is in the spotlight set', () => {
    const { container } = renderLane({ spotlightNodeIds: new Set(['n1']) })
    const section = container.querySelector('section')!
    expect(section.hasAttribute('data-spotlighted')).toBe(true)
  })

  it('does not add data-spotlighted when spotlight set does not include a lane node', () => {
    const { container } = renderLane({ spotlightNodeIds: new Set(['n3']) })
    const section = container.querySelector('section')!
    expect(section.hasAttribute('data-spotlighted')).toBe(false)
  })

  it('does not add data-spotlighted when spotlight is inactive (null)', () => {
    const { container } = renderLane({ spotlightNodeIds: null })
    const section = container.querySelector('section')!
    expect(section.hasAttribute('data-spotlighted')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// MiniNode activation
// ---------------------------------------------------------------------------

describe('SceneLane — node activation', () => {
  it('calls onNodeActivate with the correct node id when a MiniNode is clicked', () => {
    const onNodeActivate = vi.fn()
    renderLane({ onNodeActivate })
    fireEvent.click(screen.getByRole('button', { name: /Node n1/i }))
    expect(onNodeActivate).toHaveBeenCalledWith('n1')
  })
})

// ---------------------------------------------------------------------------
// Spotlight state pass-through to MiniNode
// ---------------------------------------------------------------------------

describe('SceneLane — spotlight state pass-through', () => {
  it('MiniNode has no data-spotlight attribute when spotlight is inactive', () => {
    renderLane({ spotlightNodeIds: null, focusNodeId: null })
    const btn = screen.getByRole('button', { name: /Node n1/i })
    expect(btn.hasAttribute('data-spotlight')).toBe(false)
  })

  it('focus node gets data-spotlight="focus"', () => {
    renderLane({ spotlightNodeIds: new Set(['n1', 'n2']), focusNodeId: 'n1' })
    const focusBtn = screen.getByRole('button', { name: /Node n1/i })
    expect(focusBtn.getAttribute('data-spotlight')).toBe('focus')
  })

  it('neighbour node gets data-spotlight="neighbour"', () => {
    renderLane({ spotlightNodeIds: new Set(['n1', 'n2']), focusNodeId: 'n1' })
    const neighbourBtn = screen.getByRole('button', { name: /Node n2/i })
    expect(neighbourBtn.getAttribute('data-spotlight')).toBe('neighbour')
  })

  it('node outside spotlight set gets data-spotlight="dimmed"', () => {
    // sceneA has n1, n2, sceneB — spotlight only n1
    renderLane({ spotlightNodeIds: new Set(['n1']), focusNodeId: 'n1' })
    const dimmedBtn = screen.getByRole('button', { name: /Node n2/i })
    expect(dimmedBtn.getAttribute('data-spotlight')).toBe('dimmed')
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('SceneLane — axe-core', () => {
  it('has no violations in the expanded state', async () => {
    const { container } = renderLane({})
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no violations in the collapsed state', async () => {
    const { container } = renderLane({})
    const toggleBtn = document.querySelector('button[aria-expanded]') as HTMLButtonElement
    fireEvent.click(toggleBtn)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no violations with spotlight active (focus + neighbours)', async () => {
    const { container } = renderLane({
      spotlightNodeIds: new Set(['n1', 'n2']),
      focusNodeId: 'n1',
    })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no violations with dimmed nodes', async () => {
    const { container } = renderLane({
      spotlightNodeIds: new Set(['n1']),
      focusNodeId: 'n1',
    })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no violations with flow indicators present', async () => {
    const { container } = renderLane({ sceneId: 'sceneB', nodes: sceneBNodes })
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
