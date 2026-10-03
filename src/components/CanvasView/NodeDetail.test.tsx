import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { NodeDetail } from './NodeDetail'
import type { AdventureNode } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id: 'n1',
    title: 'The Dark Cave',
    node_type: 'narrative',
    narrativeText: 'You stand at the mouth of the cave.',
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
    depth: 2,
    ...overrides,
  }
}

function ch(nextNode: string, choiceText = `Go to ${nextNode}`) {
  return { choiceText, choiceResponseConstraint: '', nextNode }
}

const defaultAllNodes: AdventureNode[] = [
  makeNode({ id: 'n1', title: 'The Dark Cave' }),
  makeNode({ id: 'n2', title: 'The Bridge' }),
  makeNode({ id: 'n3', title: 'The Tower' }),
]

function renderDetail(
  node: AdventureNode | null,
  opts: {
    tags?: ClassifierTags | null
    allNodes?: AdventureNode[]
    onActivate?: (id: string) => void
    onEdit?: (id: string) => void
  } = {},
) {
  const tags = 'tags' in opts ? opts.tags ?? null : makeTags()
  const allNodes = opts.allNodes ?? defaultAllNodes
  const onActivate = opts.onActivate ?? vi.fn()
  return render(
    <NodeDetail
      node={node}
      tags={tags}
      allNodes={allNodes}
      onActivate={onActivate}
      onEdit={opts.onEdit}
    />,
  )
}

// ---------------------------------------------------------------------------
// Placeholder state (node === null)
// ---------------------------------------------------------------------------

describe('NodeDetail — placeholder state', () => {
  it('renders the aside landmark', () => {
    renderDetail(null)
    expect(screen.getByRole('complementary', { name: /Node detail/i })).toBeTruthy()
  })

  it('shows the placeholder message', () => {
    renderDetail(null)
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
  })

  it('renders no headings when null', () => {
    renderDetail(null)
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('renders no buttons when null', () => {
    renderDetail(null)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Node title and type
// ---------------------------------------------------------------------------

describe('NodeDetail — title and type', () => {
  it('renders the node title as an h2', () => {
    renderDetail(makeNode())
    const heading = screen.getByRole('heading', { level: 2, name: 'The Dark Cave' })
    expect(heading).toBeTruthy()
  })

  it('renders the type badge text', () => {
    renderDetail(makeNode({ node_type: 'decision' }))
    expect(screen.getByText('decision')).toBeTruthy()
  })

  it('renders the node id in the footer', () => {
    renderDetail(makeNode({ id: 'my-node-id' }))
    expect(screen.getByText('my-node-id')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Classifier tags
// ---------------------------------------------------------------------------

describe('NodeDetail — classifier tags', () => {
  it('shows orphan tag when isOrphan is true', () => {
    renderDetail(makeNode(), { tags: makeTags({ isOrphan: true }) })
    expect(screen.getByText('Orphan')).toBeTruthy()
  })

  it('shows unreachable tag when unreachable is true', () => {
    renderDetail(makeNode(), { tags: makeTags({ unreachable: true }) })
    expect(screen.getByText('Unreachable')).toBeTruthy()
  })

  it('shows checkpoint tag when isCheckpoint is true', () => {
    renderDetail(makeNode(), { tags: makeTags({ isCheckpoint: true }) })
    expect(screen.getByText('Checkpoint')).toBeTruthy()
  })

  it('shows Terminal meta tag when isTerminal is true', () => {
    renderDetail(makeNode({ node_type: 'end' }), { tags: makeTags({ isTerminal: true }) })
    expect(screen.getByText('Terminal')).toBeTruthy()
  })

  it('shows Scene meta tag when sceneId is set', () => {
    renderDetail(makeNode(), { tags: makeTags({ sceneId: 'scene-abc-123' }) })
    expect(screen.getByText(/Scene: scene-ab/)).toBeTruthy()
  })

  it('truncates sceneId to 8 chars in the Scene tag', () => {
    renderDetail(makeNode(), { tags: makeTags({ sceneId: 'long-scene-id-here' }) })
    expect(screen.getByText('Scene: long-sce')).toBeTruthy()
  })

  it('shows Depth meta tag when depth is finite', () => {
    renderDetail(makeNode(), { tags: makeTags({ depth: 5 }) })
    expect(screen.getByText('Depth: 5')).toBeTruthy()
  })

  it('does not show Depth tag when depth is Infinity', () => {
    renderDetail(makeNode(), { tags: makeTags({ depth: Infinity }) })
    expect(screen.queryByText(/Depth:/)).toBeNull()
  })

  it('renders no tag area when tags is null', () => {
    renderDetail(makeNode(), { tags: null })
    expect(screen.queryByText('Orphan')).toBeNull()
    expect(screen.queryByText('Terminal')).toBeNull()
    expect(screen.queryByText(/Depth:/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Narrative section
// ---------------------------------------------------------------------------

describe('NodeDetail — narrative', () => {
  it('renders the narrative text', () => {
    renderDetail(makeNode({ narrativeText: 'You stand at the mouth of the cave.' }))
    expect(screen.getByText('You stand at the mouth of the cave.')).toBeTruthy()
  })

  it('shows "No narrative text." when narrativeText is empty', () => {
    renderDetail(makeNode({ narrativeText: '' }))
    expect(screen.getByText('No narrative text.')).toBeTruthy()
  })

  it('renders a Narrative section heading', () => {
    renderDetail(makeNode())
    expect(screen.getByRole('heading', { level: 3, name: 'Narrative' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Choices section
// ---------------------------------------------------------------------------

describe('NodeDetail — choices', () => {
  it('shows "No choices." when node has no choices', () => {
    renderDetail(makeNode({ choices: [] }))
    expect(screen.getByText('No choices.')).toBeTruthy()
  })

  it('renders the Choices heading with count', () => {
    renderDetail(makeNode({ choices: [ch('n2'), ch('n3')] }))
    expect(screen.getByRole('heading', { level: 3, name: /Choices \(2\)/i })).toBeTruthy()
  })

  it('renders one button per choice', () => {
    renderDetail(makeNode({ choices: [ch('n2'), ch('n3')] }))
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('shows choice text in each button', () => {
    renderDetail(makeNode({ choices: [ch('n2', 'Cross the bridge')] }))
    expect(screen.getByText('Cross the bridge')).toBeTruthy()
  })

  it('resolves the target node title from allNodes', () => {
    renderDetail(makeNode({ choices: [ch('n2', 'Go')] }))
    // n2 title is 'The Bridge'
    expect(screen.getByText('The Bridge')).toBeTruthy()
  })

  it('falls back to node id when target not in allNodes', () => {
    renderDetail(makeNode({ choices: [ch('unknown-id', 'Jump')] }))
    expect(screen.getByText('unknown-id')).toBeTruthy()
  })

  it('shows "(untitled choice)" when choiceText is empty', () => {
    const node = makeNode({
      choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'n2' }],
    })
    renderDetail(node)
    expect(screen.getByText('(untitled choice)')).toBeTruthy()
  })

  it('calls onActivate with the target node id when a choice is clicked', () => {
    const onActivate = vi.fn()
    renderDetail(makeNode({ choices: [ch('n2', 'Cross the bridge')] }), { onActivate })
    fireEvent.click(screen.getByRole('button', { name: /Cross the bridge/ }))
    expect(onActivate).toHaveBeenCalledWith('n2')
  })

  it('calls onActivate with the correct id when multiple choices are present', () => {
    const onActivate = vi.fn()
    renderDetail(
      makeNode({ choices: [ch('n2', 'Go left'), ch('n3', 'Go right')] }),
      { onActivate },
    )
    fireEvent.click(screen.getByRole('button', { name: /Go right/ }))
    expect(onActivate).toHaveBeenCalledWith('n3')
  })
})

// ---------------------------------------------------------------------------
// onEdit prop
// ---------------------------------------------------------------------------

describe('NodeDetail — onEdit', () => {
  it('does not render the edit button when onEdit is not provided', () => {
    renderDetail(makeNode())
    expect(screen.queryByRole('button', { name: /Edit in outline/i })).toBeNull()
  })

  it('renders the edit button when onEdit is provided', () => {
    renderDetail(makeNode(), { onEdit: vi.fn() })
    expect(screen.getByRole('button', { name: /Edit in outline/i })).toBeTruthy()
  })

  it('calls onEdit with the node id when the edit button is clicked', () => {
    const onEdit = vi.fn()
    renderDetail(makeNode({ id: 'my-node' }), { onEdit })
    fireEvent.click(screen.getByRole('button', { name: /Edit in outline/i }))
    expect(onEdit).toHaveBeenCalledWith('my-node')
  })

  it('does not render the edit button in the placeholder state (node is null)', () => {
    renderDetail(null, { onEdit: vi.fn() })
    expect(screen.queryByRole('button', { name: /Edit in outline/i })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('NodeDetail — axe-core', () => {
  it('has no violations in the placeholder state', async () => {
    const { container } = renderDetail(null)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with a basic node (no tags)', async () => {
    const { container } = renderDetail(makeNode(), { tags: null })
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with classifier tags', async () => {
    const { container } = renderDetail(
      makeNode(),
      { tags: makeTags({ isOrphan: true, isCheckpoint: true, sceneId: 'scene-x', depth: 3 }) },
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with choices', async () => {
    const { container } = renderDetail(
      makeNode({ choices: [ch('n2', 'Go left'), ch('n3', 'Go right')] }),
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations for a terminal node', async () => {
    const { container } = renderDetail(
      makeNode({ node_type: 'end', choices: [], narrativeText: '' }),
      { tags: makeTags({ isTerminal: true, depth: 4 }) },
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})
