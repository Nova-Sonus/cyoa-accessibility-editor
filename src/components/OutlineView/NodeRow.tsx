import { useState, useCallback, useEffect, useRef, useId } from 'react'
import type { AdventureNode, NodeType } from '../../types/adventure'
import { isTerminalNodeType } from '../../types/adventure'
import { useAdventureStore } from '../../store/StoreContext'
import { ChoiceRow } from './ChoiceRow'

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
  /** Every node id in the document, for populating the nextNode select. */
  allNodeIds: ReadonlyArray<string>
  /**
   * Called when the user creates a stub node via the nextNode combobox.
   * The parent uses this to move focus to the new node's title field.
   */
  onNewNodeCreated: (newNodeId: string) => void
  /**
   * When true, opens the `<details>` and moves focus to the title input.
   * Used to shift focus to a newly created stub node.
   */
  focusTitleOnMount?: boolean
  /** Called after focus has been applied so the parent can clear the request. */
  onFocusApplied?: () => void
}

/**
 * A single expandable row in the outline view.
 *
 * Uses `<details>`/`<summary>` for native keyboard-accessible expand/collapse.
 * Draft state is held locally and committed to the store on blur (title,
 * narrativeText, choiceText) or on change (node_type, nextNode).
 */
export function NodeRow({
  node,
  onAnnounce,
  onChoicesCleared,
  allNodeIds,
  onNewNodeCreated,
  focusTitleOnMount,
  onFocusApplied,
}: NodeRowProps) {
  const updateNode = useAdventureStore((s) => s.updateNode)
  const addChoice = useAdventureStore((s) => s.addChoice)

  const detailsRef = useRef<HTMLDetailsElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  // useId produces a stable, unique prefix for all field ids in this row.
  const baseId = useId()
  const titleId = `${baseId}-title`
  const typeId = `${baseId}-type`
  const narrativeId = `${baseId}-narrative`
  const noChoicesHintId = `${baseId}-no-choices-hint`

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

  // Focus management — open the row and focus the title input when requested.
  useEffect(() => {
    if (focusTitleOnMount && detailsRef.current && titleInputRef.current) {
      detailsRef.current.open = true
      titleInputRef.current.focus()
      onFocusApplied?.()
    }
  }, [focusTitleOnMount, onFocusApplied])

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

  const handleAddChoice = useCallback(() => {
    addChoice(node.id, { choiceText: '', choiceResponseConstraint: '', nextNode: '' })
    onAnnounce('Choice added.')
  }, [node.id, addChoice, onAnnounce])

  const isTerminal = isTerminalNodeType(node.node_type)

  return (
    <li>
      <details ref={detailsRef}>
        <summary>
          {node.title}
          {/* Parenthetical type is decorative — title alone is sufficient context. */}
          <span aria-hidden="true"> ({node.node_type})</span>
        </summary>

        <div>
          <div>
            <label htmlFor={titleId}>Title</label>
            <input
              ref={titleInputRef}
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
           * Terminal nodes (end, adventure_success) cannot have choices.
           * Show an accessible explanation rather than silently omitting the
           * section, so authors understand why the editor is unavailable.
           * The store enforces the invariant by clearing choices on terminal
           * transition; the UI enforces it by hiding the add affordance.
           */}
          {isTerminal ? (
            <p id={noChoicesHintId}>Choices are not available for terminal nodes.</p>
          ) : (
            <section aria-label={`Choices for ${node.id}`}>
              {node.choices.length > 0 && (
                <ul>
                  {node.choices.map((c, i) => (
                    <ChoiceRow
                      key={i}
                      nodeId={node.id}
                      choice={c}
                      choiceIndex={i}
                      allNodeIds={allNodeIds}
                      onNewNodeCreated={onNewNodeCreated}
                      onAnnounce={onAnnounce}
                    />
                  ))}
                </ul>
              )}
              <button type="button" onClick={handleAddChoice}>
                Add choice
              </button>
            </section>
          )}
        </div>
      </details>
    </li>
  )
}
