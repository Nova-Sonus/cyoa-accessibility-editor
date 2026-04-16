import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'jest-axe'
import { IssuesPanel } from './IssuesPanel'
import { deriveIssues } from './deriveIssues'
import { classifyAll } from '../../classifier'
import type { AdventureNode } from '../../types/adventure'

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

// ---------------------------------------------------------------------------
// deriveIssues — unit tests
// ---------------------------------------------------------------------------

describe('deriveIssues — clean document', () => {
  it('returns an empty array for a structurally clean document', () => {
    const doc = [
      makeNode('start', { node_type: 'start', choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'end' }] }),
      makeNode('end', { node_type: 'end' }),
    ]
    const cache = classifyAll(doc)
    expect(deriveIssues(doc, cache)).toHaveLength(0)
  })
})

describe('deriveIssues — orphan nodes', () => {
  it('flags a non-start node with no incoming edges as an orphan', () => {
    const doc = [
      makeNode('start', { node_type: 'start' }),
      makeNode('orphan'),
    ]
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    expect(issues.some((i) => i.kind === 'orphan' && i.nodeId === 'orphan')).toBe(true)
  })

  it('does not flag a start node as an orphan', () => {
    const doc = [makeNode('start', { node_type: 'start' })]
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    expect(issues.some((i) => i.kind === 'orphan')).toBe(false)
  })

  it('includes the node title in the orphan issue', () => {
    const doc = [
      makeNode('start', { node_type: 'start' }),
      makeNode('orphan', { title: 'Lost Node' }),
    ]
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    const orphan = issues.find((i) => i.kind === 'orphan')
    expect(orphan?.nodeTitle).toBe('Lost Node')
  })
})

describe('deriveIssues — unreachable nodes', () => {
  it('flags a node reachable only via a cycle disconnected from start', () => {
    // n2 → n3 → n2 cycle; n1 (start) has no path to them
    const doc = [
      makeNode('n1', { node_type: 'start' }),
      makeNode('n2', { choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'n3' }] }),
      makeNode('n3', { choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'n2' }] }),
    ]
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    // n2 and n3 have in-degree > 0 but are unreachable from start
    const kinds = issues.map((i) => i.kind)
    expect(kinds).toContain('unreachable')
    // They should NOT also appear as orphans (in-degree ≥ 1)
    const unreachableIds = issues.filter((i) => i.kind === 'unreachable').map((i) => i.nodeId)
    expect(unreachableIds).toContain('n2')
    expect(unreachableIds).toContain('n3')
    expect(issues.some((i) => i.kind === 'orphan' && (i.nodeId === 'n2' || i.nodeId === 'n3'))).toBe(false)
  })
})

describe('deriveIssues — terminal node with choices', () => {
  it('flags a terminal node that has stray choices', () => {
    // Build the document manually — bypass store to simulate a loaded document
    const doc: AdventureNode[] = [
      {
        id: 'end',
        title: 'The End',
        node_type: 'end',
        narrativeText: '',
        choices: [{ choiceText: 'Try again', choiceResponseConstraint: '', nextNode: 'start' }],
      },
      makeNode('start', { node_type: 'start' }),
    ]
    // classifyAll marks 'end' as isTerminal; choices.length > 0 in doc
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    expect(issues.some((i) => i.kind === 'terminal-with-choices' && i.nodeId === 'end')).toBe(true)
  })

  it('does not flag a terminal node with an empty choices array', () => {
    const doc = [makeNode('end', { node_type: 'end' })]
    const cache = classifyAll(doc)
    expect(deriveIssues(doc, cache).some((i) => i.kind === 'terminal-with-choices')).toBe(false)
  })
})

describe('deriveIssues — dangling references', () => {
  it('flags a choice whose nextNode references a missing node', () => {
    const doc = [
      makeNode('n1', {
        choices: [{ choiceText: 'Go there', choiceResponseConstraint: '', nextNode: 'ghost' }],
      }),
    ]
    const cache = classifyAll(doc)
    const issues = deriveIssues(doc, cache)
    expect(issues.some((i) => i.kind === 'dangling-reference' && i.nodeId === 'n1')).toBe(true)
    expect(issues.find((i) => i.kind === 'dangling-reference')?.message).toContain('"ghost"')
  })

  it('does not flag a choice with an empty nextNode', () => {
    const doc = [
      makeNode('n1', {
        choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: '' }],
      }),
    ]
    const cache = classifyAll(doc)
    expect(deriveIssues(doc, cache).some((i) => i.kind === 'dangling-reference')).toBe(false)
  })

  it('uses "(unnamed)" when choiceText is empty', () => {
    const doc = [
      makeNode('n1', {
        choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'missing' }],
      }),
    ]
    const cache = classifyAll(doc)
    const issue = deriveIssues(doc, cache).find((i) => i.kind === 'dangling-reference')
    expect(issue?.message).toContain('(unnamed)')
  })

  it('produces stable ids per dangling reference', () => {
    const doc = [
      makeNode('n1', {
        choices: [{ choiceText: '', choiceResponseConstraint: '', nextNode: 'ghost' }],
      }),
    ]
    const cache = classifyAll(doc)
    const issue = deriveIssues(doc, cache).find((i) => i.kind === 'dangling-reference')
    expect(issue?.id).toBe('dangling:n1:ghost')
  })
})

// ---------------------------------------------------------------------------
// IssuesPanel — component tests
// ---------------------------------------------------------------------------

describe('IssuesPanel — no issues state', () => {
  it('renders "No issues found" when the issues array is empty', () => {
    render(<IssuesPanel issues={[]} onActivate={vi.fn()} />)
    expect(screen.getByText(/No issues found/i)).toBeTruthy()
  })

  it('renders a section with aria-label="Issues"', () => {
    render(<IssuesPanel issues={[]} onActivate={vi.fn()} />)
    expect(screen.getByRole('region', { name: 'Issues' })).toBeTruthy()
  })

  it('has no axe violations in the empty state', async () => {
    const { container } = render(<IssuesPanel issues={[]} onActivate={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe('IssuesPanel — with issues', () => {
  const sampleIssues = [
    {
      id: 'orphan:n1',
      kind: 'orphan' as const,
      nodeId: 'n1',
      nodeTitle: 'Lost Node',
      message: 'Orphan node — not referenced by any other node.',
    },
    {
      id: 'dangling:n2:ghost',
      kind: 'dangling-reference' as const,
      nodeId: 'n2',
      nodeTitle: 'Branch Node',
      message: 'Choice "Go there" references missing node "ghost".',
    },
  ]

  it('renders one button per issue', () => {
    render(<IssuesPanel issues={sampleIssues} onActivate={vi.fn()} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(sampleIssues.length)
  })

  it('calls onActivate with the correct nodeId when an issue button is clicked', () => {
    const onActivate = vi.fn()
    render(<IssuesPanel issues={sampleIssues} onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0]!)
    expect(onActivate).toHaveBeenCalledWith('n1')
  })

  it('calls onActivate with the second issue nodeId when the second button is clicked', () => {
    const onActivate = vi.fn()
    render(<IssuesPanel issues={sampleIssues} onActivate={onActivate} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]!)
    expect(onActivate).toHaveBeenCalledWith('n2')
  })

  it('does not render "No issues found" when there are issues', () => {
    render(<IssuesPanel issues={sampleIssues} onActivate={vi.fn()} />)
    expect(screen.queryByText(/No issues found/i)).toBeNull()
  })

  it('has no axe violations with issues visible', async () => {
    const { container } = render(<IssuesPanel issues={sampleIssues} onActivate={vi.fn()} />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
