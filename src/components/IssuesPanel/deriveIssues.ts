import type { Adventure } from '../../types/adventure'
import type { ClassifierTags, NodeId } from '../../classifier'

/** Discriminated union of all issue categories the panel can surface. */
export type IssueKind =
  | 'terminal-with-choices'
  | 'orphan'
  | 'unreachable'
  | 'dangling-reference'

export interface Issue {
  /** Stable unique key for React list rendering. */
  id: string
  kind: IssueKind
  /** The id of the node this issue is associated with. */
  nodeId: string
  /** Human-readable node title, for display. */
  nodeTitle: string
  /** Human-readable description of the issue. */
  message: string
}

/**
 * Derives all structural issues from the current adventure document and its
 * classifier cache.
 *
 * This is a pure function — no side effects, no imports from store or
 * repository — so it can be called inside `useMemo` and unit-tested directly.
 *
 * Issue categories:
 * - `terminal-with-choices`: a terminal node (`end` / `adventure_success`)
 *   that still has choices in the document.  The store prevents this during
 *   normal editing (it clears choices on terminal transition), but a document
 *   loaded from an external source may contain this condition.
 * - `orphan`: a non-`start` node with no incoming choice edges.  It can never
 *   be reached by the player.
 * - `unreachable`: a node with in-degree ≥ 1 that nevertheless cannot be
 *   reached from any `start` node (e.g., a cycle disconnected from the start
 *   graph).  Orphan nodes are excluded here to avoid double-reporting.
 * - `dangling-reference`: a choice whose `nextNode` field names a node id that
 *   does not exist in the document.
 */
export function deriveIssues(
  document: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): Issue[] {
  const nodeIds = new Set(document.map((n) => n.id))
  const issues: Issue[] = []

  for (const node of document) {
    const tags = classifierCache.get(node.id)

    // Terminal node with stray choices.
    if (tags?.isTerminal === true && node.choices.length > 0) {
      issues.push({
        id: `terminal-with-choices:${node.id}`,
        kind: 'terminal-with-choices',
        nodeId: node.id,
        nodeTitle: node.title,
        message: `Terminal node has ${node.choices.length} ${node.choices.length === 1 ? 'choice' : 'choices'} — terminal nodes cannot have choices.`,
      })
    }

    // Orphan node (no incoming edges, not a start node).
    if (tags?.isOrphan === true) {
      issues.push({
        id: `orphan:${node.id}`,
        kind: 'orphan',
        nodeId: node.id,
        nodeTitle: node.title,
        message: 'Orphan node — not referenced by any other node.',
      })
    }

    // Unreachable but not orphan (has incoming edges, disconnected from start).
    if (tags?.unreachable === true && tags.isOrphan === false) {
      issues.push({
        id: `unreachable:${node.id}`,
        kind: 'unreachable',
        nodeId: node.id,
        nodeTitle: node.title,
        message: 'Unreachable node — cannot be reached from any start node.',
      })
    }

    // Dangling nextNode references.
    for (const choice of node.choices) {
      if (choice.nextNode !== '' && !nodeIds.has(choice.nextNode)) {
        issues.push({
          id: `dangling:${node.id}:${choice.nextNode}`,
          kind: 'dangling-reference',
          nodeId: node.id,
          nodeTitle: node.title,
          message: `Choice "${choice.choiceText || '(unnamed)'}" references missing node "${choice.nextNode}".`,
        })
      }
    }
  }

  return issues
}
