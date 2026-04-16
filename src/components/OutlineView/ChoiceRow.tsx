import { useState, useCallback, useEffect, useId } from 'react'
import type { Choice } from '../../types/adventure'
import { useAdventureStore } from '../../store/StoreContext'

/**
 * Sentinel value used as the `<option value>` for the "Create new node"
 * affordance in the nextNode select.  It is not a valid node id — it triggers
 * the `createNodeAndLinkChoice` store action instead of `updateChoice`.
 */
export const CREATE_NEW_NODE_VALUE = '__create_new__'

export interface ChoiceRowProps {
  nodeId: string
  choice: Choice
  choiceIndex: number
  /** Every node id present in the document, used to populate the nextNode select. */
  allNodeIds: ReadonlyArray<string>
  /**
   * Called after `createNodeAndLinkChoice` completes so the parent can move
   * keyboard focus to the new node's title field.
   */
  onNewNodeCreated: (newNodeId: string) => void
  /** Routes announcements to the consolidated `aria-live` region in OutlineView. */
  onAnnounce: (message: string) => void
}

/**
 * A single editable choice row inside a node's choices section.
 *
 * Fields:
 * - `choiceText` — draft state committed to the store on blur.
 * - `nextNode`   — `<select>` committed to the store on every change.
 *
 * When the nextNode select value is `CREATE_NEW_NODE_VALUE`, a stub node is
 * created atomically in the store and focus moves to its title field.
 *
 * If `choice.nextNode` references a node id that is no longer in the document,
 * a "(not found)" option is shown in the select and an `aria-describedby`
 * hint is wired up so screen readers announce the dangling reference.
 */
export function ChoiceRow({
  nodeId,
  choice,
  choiceIndex,
  allNodeIds,
  onNewNodeCreated,
  onAnnounce,
}: ChoiceRowProps) {
  const updateChoice = useAdventureStore((s) => s.updateChoice)
  const deleteChoice = useAdventureStore((s) => s.deleteChoice)
  const createNodeAndLinkChoice = useAdventureStore((s) => s.createNodeAndLinkChoice)

  const baseId = useId()
  const choiceTextId = `${baseId}-choice-text`
  const constraintId = `${baseId}-constraint`
  const nextNodeId = `${baseId}-next-node`
  const danglingHintId = `${baseId}-dangling`

  const [choiceTextDraft, setChoiceTextDraft] = useState(choice.choiceText)
  const [constraintDraft, setConstraintDraft] = useState(choice.choiceResponseConstraint)

  // Sync drafts if the choice changes from outside (e.g. undo or store reload).
  useEffect(() => {
    setChoiceTextDraft(choice.choiceText)
  }, [choice.choiceText])

  useEffect(() => {
    setConstraintDraft(choice.choiceResponseConstraint)
  }, [choice.choiceResponseConstraint])

  const handleChoiceTextBlur = useCallback(() => {
    if (choiceTextDraft !== choice.choiceText) {
      updateChoice(nodeId, choiceIndex, { choiceText: choiceTextDraft })
    }
  }, [choiceTextDraft, choice.choiceText, nodeId, choiceIndex, updateChoice])

  const handleConstraintBlur = useCallback(() => {
    if (constraintDraft !== choice.choiceResponseConstraint) {
      updateChoice(nodeId, choiceIndex, { choiceResponseConstraint: constraintDraft })
    }
  }, [constraintDraft, choice.choiceResponseConstraint, nodeId, choiceIndex, updateChoice])

  const handleNextNodeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value
      if (value === CREATE_NEW_NODE_VALUE) {
        const newNodeId = createNodeAndLinkChoice(nodeId, choiceIndex)
        onNewNodeCreated(newNodeId)
        onAnnounce('New node created and linked.')
      } else {
        updateChoice(nodeId, choiceIndex, { nextNode: value })
      }
    },
    [nodeId, choiceIndex, createNodeAndLinkChoice, updateChoice, onNewNodeCreated, onAnnounce],
  )

  const handleDelete = useCallback(() => {
    deleteChoice(nodeId, choiceIndex)
    onAnnounce('Choice deleted.')
  }, [nodeId, choiceIndex, deleteChoice, onAnnounce])

  // A nextNode is dangling when it is non-empty but not present in the document.
  const isDangling = choice.nextNode !== '' && !allNodeIds.includes(choice.nextNode)

  return (
    <li>
      <div>
        <label htmlFor={choiceTextId}>Choice text</label>
        <input
          id={choiceTextId}
          type="text"
          value={choiceTextDraft}
          onChange={(e) => setChoiceTextDraft(e.target.value)}
          onBlur={handleChoiceTextBlur}
        />
      </div>

      <div>
        <label htmlFor={constraintId}>Response constraint</label>
        <input
          id={constraintId}
          type="text"
          value={constraintDraft}
          onChange={(e) => setConstraintDraft(e.target.value)}
          onBlur={handleConstraintBlur}
        />
      </div>

      <div>
        <label htmlFor={nextNodeId}>Next node</label>
        <select
          id={nextNodeId}
          value={choice.nextNode}
          onChange={handleNextNodeChange}
          aria-describedby={isDangling ? danglingHintId : undefined}
        >
          <option value="">-- Select destination --</option>
          <option value={CREATE_NEW_NODE_VALUE}>+ Create new node</option>
          {/*
           * When the current nextNode is dangling, add a labelled option so
           * the select renders the stored value rather than silently falling
           * back to the first option.
           */}
          {isDangling && (
            <option value={choice.nextNode}>{choice.nextNode} (not found)</option>
          )}
          {allNodeIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>

        {isDangling && (
          <span id={danglingHintId}>
            Node &ldquo;{choice.nextNode}&rdquo; no longer exists.
          </span>
        )}
      </div>

      <button type="button" onClick={handleDelete}>
        Delete choice
      </button>
    </li>
  )
}
