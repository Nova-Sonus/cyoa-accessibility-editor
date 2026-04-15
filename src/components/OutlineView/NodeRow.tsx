import { useState, useCallback, useEffect, useId } from 'react'
import type { AdventureNode, NodeType } from '../../types/adventure'
import { isTerminalNodeType } from '../../types/adventure'
import { useAdventureStore } from '../../store/StoreContext'

/**
 * All eight node_type values from CYOA_Schema.json, in schema-defined order.
 * Exported so tests can assert the full set without duplicating the list.
 */
export const NODE_TYPES: ReadonlyArray<NodeType> = [
  'start',
  'decision',
  'scene_start',
  'end',
  'adventure_success',
  'narrative',
  'combat',
  'puzzle',
]

export interface NodeRowProps {
  node: AdventureNode
  /** Called after any field is committed to announce the change to screen readers. */
  onAnnounce: (message: string) => void
  /**
   * Called when transitioning a node to a terminal type that had pre-existing
   * choices.  The parent renders a corresponding entry in the issues panel.
   */
  onChoicesCleared: (nodeId: string, count: number) => void
}

/**
 * A single expandable row in the outline view.
 *
 * Uses `<details>`/`<summary>` for native keyboard-accessible expand/collapse.
 * Draft state is held locally and committed to the store on blur (title,
 * narrativeText) or on change (node_type).  External updates to the node
 * are synced back to the draft via `useEffect`.
 */
export function NodeRow({ node, onAnnounce, onChoicesCleared }: NodeRowProps) {
  const updateNode = useAdventureStore((s) => s.updateNode)

  // useId produces a stable, unique prefix for all field ids in this row.
  const baseId = useId()
  const titleId = `${baseId}-title`
  const typeId = `${baseId}-type`
  const narrativeId = `${baseId}-narrative`

  // Local draft state — committed to store on blur / change.
  const [titleDraft, setTitleDraft] = useState(node.title)
  const [narrativeDraft, setNarrativeDraft] = useState(node.narrativeText)

  // Sync drafts when the node changes from outside (e.g. adventure loaded).
  useEffect(() => {
    setTitleDraft(node.title)
  }, [node.title])

  useEffect(() => {
    setNarrativeDraft(node.narrativeText)
  }, [node.narrativeText])

  const handleTitleBlur = useCallback(() => {
    const trimmed = titleDraft.trim()
    if (trimmed !== node.title) {
      updateNode(node.id, { title: trimmed })
    }
    // Always announce on blur so JAWS confirms focus has moved.
    onAnnounce(`Title updated to "${trimmed}"`)
  }, [titleDraft, node.id, node.title, updateNode, onAnnounce])

  const handleNarrativeBlur = useCallback(() => {
    if (narrativeDraft !== node.narrativeText) {
      updateNode(node.id, { narrativeText: narrativeDraft })
    }
  }, [narrativeDraft, node.id, node.narrativeText, updateNode])

  const handleNodeTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newType = e.target.value as NodeType
      const prevChoicesCount = node.choices.length
      const willBeTerminal = isTerminalNodeType(newType)

      // Flag before calling updateNode so the issues panel title reflects the
      // node's current (pre-transition) title rather than a stale value.
      if (willBeTerminal && prevChoicesCount > 0) {
        onChoicesCleared(node.id, prevChoicesCount)
      }

      updateNode(node.id, { node_type: newType })
      onAnnounce(`Node type changed to ${newType}`)
    },
    [node.id, node.choices.length, updateNode, onAnnounce, onChoicesCleared],
  )

  const isTerminal = isTerminalNodeType(node.node_type)

  return (
    <li>
      <details>
        <summary>
          {node.title}
          {/* Parenthetical type is decorative — title alone is sufficient context. */}
          <span aria-hidden="true"> ({node.node_type})</span>
        </summary>

        <div>
          <div>
            <label htmlFor={titleId}>Title</label>
            <input
              id={titleId}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={handleTitleBlur}
            />
          </div>

          <div>
            <label htmlFor={typeId}>Node type</label>
            <select id={typeId} value={node.node_type} onChange={handleNodeTypeChange}>
              {NODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={narrativeId}>Narrative text</label>
            <textarea
              id={narrativeId}
              value={narrativeDraft}
              onChange={(e) => setNarrativeDraft(e.target.value)}
              onBlur={handleNarrativeBlur}
            />
          </div>

          {/*
           * Choices section is hidden for terminal nodes (end, adventure_success).
           * Schema if/then enforces an empty choices array on these types, and the
           * store clears choices transactionally when node_type transitions.
           * Full choice editing is implemented in OPS-530.
           */}
          {!isTerminal && (
            <section aria-label={`Choices: ${node.choices.length}`}>
              {node.choices.length === 0 ? (
                <p>No choices yet.</p>
              ) : (
                <ul>
                  {node.choices.map((c, i) => (
                    <li key={i}>
                      {c.choiceText} &rarr; {c.nextNode}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </details>
    </li>
  )
}
