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
  onCreateAndLink: () => void
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
      <NodeComboField
        label="Next node"
        value={choice.nextNode}
        onChange={(nodeId) => onUpdate({ nextNode: nodeId })}
        onCreateNew={onCreateAndLink}
        allNodes={allNodes}
      />
    </div>
  )
}
