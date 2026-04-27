import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { InterSceneConnectors } from './InterSceneConnectors'
import type { InterSceneEdge } from './canvasUtils'
import type { AdventureNode } from '../../types/adventure'
import { classifyAll } from '../../classifier'
import { getInterSceneEdges } from './canvasUtils'
import type { Adventure } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, title: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title,
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

const allNodes: AdventureNode[] = [
  makeNode('scene-a', 'Act One', { node_type: 'scene_start' }),
  makeNode('scene-b', 'Act Two', { node_type: 'scene_start' }),
  makeNode('node-x', 'Bridge Crossing'),
  makeNode('node-y', 'Tower Entrance'),
  makeNode('node-z', 'Tower Exit'),
]

const forwardEdge: InterSceneEdge = {
  from: 'node-x',
  to: 'node-y',
  label: 'Cross the bridge',
  fromScene: 'scene-a',
  toScene: 'scene-b',
  isBack: false,
}

const backEdge: InterSceneEdge = {
  from: 'node-z',
  to: 'node-x',
  label: 'Retreat',
  fromScene: 'scene-b',
  toScene: 'scene-a',
  isBack: true,
}

function renderPanel(
  edges: InterSceneEdge[],
  opts: {
    onActivate?: (nodeId: string) => void
    nodes?: AdventureNode[]
  } = {},
) {
  const onActivate = opts.onActivate ?? vi.fn()
  const nodes = opts.nodes ?? allNodes
  return render(
    <InterSceneConnectors edges={edges} allNodes={nodes} onActivate={onActivate} />,
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — empty state', () => {
  it('renders the section heading', () => {
    renderPanel([])
    expect(screen.getByText('Scene connections')).toBeTruthy()
  })

  it('shows "No inter-scene connections." when edges list is empty', () => {
    renderPanel([])
    expect(screen.getByText('No inter-scene connections.')).toBeTruthy()
  })

  it('renders no buttons when empty', () => {
    renderPanel([])
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Forward edge rendering
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — forward edge', () => {
  it('renders the from-scene title', () => {
    renderPanel([forwardEdge])
    expect(screen.getAllByText('Act One')).toHaveLength(1)
  })

  it('renders the to-scene title', () => {
    renderPanel([forwardEdge])
    expect(screen.getByText('Act Two')).toBeTruthy()
  })

  it('renders the choice label', () => {
    renderPanel([forwardEdge])
    expect(screen.getByText(/Cross the bridge/)).toBeTruthy()
  })

  it('does not show a back-edge badge for a forward edge', () => {
    renderPanel([forwardEdge])
    expect(screen.queryByText(/back/i)).toBeNull()
  })

  it('renders one button for one edge', () => {
    renderPanel([forwardEdge])
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('calls onActivate with edge.from when button is clicked', () => {
    const onActivate = vi.fn()
    renderPanel([forwardEdge], { onActivate })
    fireEvent.click(screen.getByRole('button'))
    expect(onActivate).toHaveBeenCalledWith('node-x')
  })
})

// ---------------------------------------------------------------------------
// Back edge rendering
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — back edge', () => {
  it('shows the back-edge badge', () => {
    renderPanel([backEdge])
    expect(screen.getByText(/↩ back/i)).toBeTruthy()
  })

  it('renders from-scene and to-scene for back edge', () => {
    renderPanel([backEdge])
    expect(screen.getByText('Act Two')).toBeTruthy()
    expect(screen.getByText('Act One')).toBeTruthy()
  })

  it('renders the choice label for back edge', () => {
    renderPanel([backEdge])
    expect(screen.getByText(/Retreat/)).toBeTruthy()
  })

  it('calls onActivate with the back-edge from node', () => {
    const onActivate = vi.fn()
    renderPanel([backEdge], { onActivate })
    fireEvent.click(screen.getByRole('button'))
    expect(onActivate).toHaveBeenCalledWith('node-z')
  })
})

// ---------------------------------------------------------------------------
// Multiple edges
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — multiple edges', () => {
  it('renders one button per edge', () => {
    renderPanel([forwardEdge, backEdge])
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('back-edge badge appears only on the back edge row', () => {
    renderPanel([forwardEdge, backEdge])
    expect(screen.getAllByText(/↩ back/i)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Title fallback
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — title fallback', () => {
  it('falls back to the scene id when the node is not in allNodes', () => {
    const edge: InterSceneEdge = {
      from: 'x',
      to: 'y',
      label: 'Jump',
      fromScene: 'unknown-scene-id',
      toScene: 'also-unknown',
      isBack: false,
    }
    renderPanel([edge])
    expect(screen.getByText('unknown-scene-id')).toBeTruthy()
    expect(screen.getByText('also-unknown')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Empty choice label
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — empty label', () => {
  it('does not render the via line when label is empty', () => {
    const edge: InterSceneEdge = {
      from: 'node-x',
      to: 'node-y',
      label: '',
      fromScene: 'scene-a',
      toScene: 'scene-b',
      isBack: false,
    }
    renderPanel([edge])
    expect(screen.queryByText(/^via/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Integration — real classifier output
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — real classifier fixture', () => {
  // Topology: start → sceneA(scene_start, "Act One") → n1 → sceneB(scene_start, "Act Two") → n2 → n1 (back)
  function ch(nextNode: string, label = `go to ${nextNode}`) {
    return { choiceText: label, choiceResponseConstraint: '', nextNode }
  }

  const adventure: Adventure = [
    makeNode('start', 'Start', { node_type: 'start', choices: [ch('sceneA')] }),
    makeNode('sceneA', 'Act One', { node_type: 'scene_start', choices: [ch('n1')] }),
    makeNode('n1', 'Node 1', { node_type: 'narrative', choices: [ch('sceneB', 'Enter Act Two')] }),
    makeNode('sceneB', 'Act Two', { node_type: 'scene_start', choices: [ch('n2')] }),
    makeNode('n2', 'Node 2', { node_type: 'narrative', choices: [ch('n1', 'Go back')] }),
  ]

  const cache = classifyAll(adventure)
  const edges = getInterSceneEdges(adventure, cache)

  it('produces at least one inter-scene edge from the fixture', () => {
    expect(edges.length).toBeGreaterThan(0)
  })

  it('renders without errors when given real edge data', () => {
    renderPanel(edges, { nodes: adventure })
    // At least one button should appear
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('shows the back edge badge for the n2→n1 back-edge', () => {
    // n2 is in sceneB; n1 is in sceneA (shallower depth) → isBack=true
    const backEdges = edges.filter((e) => e.isBack)
    expect(backEdges.length).toBeGreaterThan(0)
    renderPanel(edges, { nodes: adventure })
    expect(screen.getAllByText(/↩ back/i).length).toBe(backEdges.length)
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('InterSceneConnectors — axe-core', () => {
  it('has no violations in the empty state', async () => {
    const { container } = renderPanel([])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with a forward edge', async () => {
    const { container } = renderPanel([forwardEdge])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with a back edge', async () => {
    const { container } = renderPanel([backEdge])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with multiple edges', async () => {
    const { container } = renderPanel([forwardEdge, backEdge])
    expect(await axe(container)).toHaveNoViolations()
  })
})
