import { useId, useState } from 'react'
import { Field } from '../ui'
import { NodeComboField } from './NodeComboField'
import type { NodeOption } from './NodeComboField'
import type { Choice } from '../../types/adventure'
import styles from './CompanionPanel.module.css'

export interface CompanionChoiceRowProps {
  choice: Choice
  choiceIndex: number
  nodeId: string
  allNodes: NodeOption[]
  onUpdate: (patch: Partial<Choice>) => void
  onDelete: () => void
  /** Creates a node (titled `title`, else "New node") and points this choice at it. */
  onCreateAndLink: (title?: string) => void
}

export function CompanionChoiceRow({
  choice,
  choiceIndex,
  allNodes,
  onUpdate,
  onDelete,
  onCreateAndLink,
}: CompanionChoiceRowProps) {
  const choiceNum = choiceIndex + 1
  const newTitleId = useId()
  const [newTitle, setNewTitle] = useState('')
  const canCreate = newTitle.trim() !== ''

  const createNamedNode = () => {
    if (!canCreate) return
    onCreateAndLink(newTitle.trim())
    setNewTitle('')
  }

  return (
    <div className={styles.choiceRow}>
      <div className={styles.choiceRowHeader}>
        <span className={styles.choiceRowLabel}>Choice {choiceNum}</span>
        <button
          type="button"
          className={styles.choiceDeleteBtn}
          onClick={onDelete}
          aria-label={`Delete choice ${choiceNum}`}
        >
          ✕
        </button>
      </div>
      <Field
        label="Choice text"
        value={choice.choiceText}
        onChange={(v) => onUpdate({ choiceText: v })}
      />
      <Field
        label="Constraint"
        value={choice.choiceResponseConstraint}
        onChange={(v) => onUpdate({ choiceResponseConstraint: v })}
      />
      <div className={styles.newNodeField}>
        <label className={styles.newNodeLabel} htmlFor={newTitleId}>
          New node title
        </label>
        <div className={styles.newNodeInputRow}>
          <input
            id={newTitleId}
            type="text"
            className={styles.newNodeInput}
            value={newTitle}
            placeholder="Type a title, then Enter"
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              createNamedNode()
            }}
          />
          <button
            type="button"
            className={styles.newNodeButton}
            aria-label={`Create node and link choice ${choiceNum}`}
            title="Create this node and link the choice to it"
            disabled={!canCreate}
            onClick={createNamedNode}
          >
            +
          </button>
        </div>
      </div>
      <NodeComboField
        label="Next node"
        value={choice.nextNode}
        onChange={(nodeId) => onUpdate({ nextNode: nodeId })}
        onCreateNew={() => onCreateAndLink()}
        allNodes={allNodes}
      />
    </div>
  )
}
