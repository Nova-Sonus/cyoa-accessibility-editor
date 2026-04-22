import { useNodeEditor } from './useNodeEditor'
import { AudioComboField } from './AudioComboField'
import { ActivitiesList } from './ActivitiesList'
import { CompanionChoiceRow } from './CompanionChoiceRow'
import { FieldGroup, Field, SelectField } from '../ui'
import type { NodeType } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier/types'
import type { ClassifierTagKey } from '../../styles/tokens'
import { NODE_COLOURS } from '../../styles/tokens'
import { TypeBadge, ClassifierTag } from '../ui'
import { isTerminalNodeType } from '../../types/adventure'
import styles from './CompanionPanel.module.css'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NODE_TYPES: ReadonlyArray<NodeType> = [
  'start',
  'decision',
  'scene_start',
  'end',
  'adventure_success',
  'narrative',
  'combat',
  'puzzle',
]

interface BoolTagEntry {
  field: keyof Pick<ClassifierTags, 'isOrphan' | 'unreachable' | 'isJunction' | 'isBranch' | 'isLinearLink' | 'isCheckpoint'>
  key: ClassifierTagKey
}

const BOOL_TAG_MAP: ReadonlyArray<BoolTagEntry> = [
  { field: 'isOrphan',      key: 'orphan' },
  { field: 'unreachable',   key: 'unreachable' },
  { field: 'isJunction',    key: 'junction' },
  { field: 'isBranch',      key: 'branch' },
  { field: 'isLinearLink',  key: 'linear_link' },
  { field: 'isCheckpoint',  key: 'checkpoint' },
]

// ---------------------------------------------------------------------------
// CompanionPanel
// ---------------------------------------------------------------------------

export function CompanionPanel() {
  const {
    node,
    tags,
    allNodes,
    audioSuggestions,
    updateNode,
    updateChoice,
    deleteChoice,
    deleteConfirm,
    setDeleteConfirm,
    handleAddChoice,
    handleCreateAndLink,
    handleDeleteNode,
  } = useNodeEditor()

  if (node == null) {
    return (
      <aside className={styles.panel} aria-label="Node editor">
        <p className={styles.placeholder}>Select a node to edit</p>
      </aside>
    )
  }

  const colours = NODE_COLOURS[node.node_type]
  const isTerminal = isTerminalNodeType(node.node_type)
  const isStart = node.node_type === 'start'

  return (
    <aside
      className={styles.panel}
      aria-label="Node editor"
      style={{ '--node-border': colours.border, '--node-bg': colours.bg } as React.CSSProperties}
    >
      {/* Panel header */}
      <header className={styles.header}>
        <h2 className={styles.nodeTitle}>{node.title}</h2>
        <div className={styles.typeRow}>
          <TypeBadge type={node.node_type} />
        </div>
        {tags != null && (
          <div className={styles.tagList}>
            {BOOL_TAG_MAP.map(({ field, key }) =>
              tags[field] ? <ClassifierTag key={key} tag={key} /> : null,
            )}
            {tags.isTerminal && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f1f5f9', '--meta-fg': '#475569', '--meta-border': '#cbd5e1' } as React.CSSProperties}
              >
                Terminal
              </span>
            )}
            {tags.sceneId != null && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f0fdfa', '--meta-fg': '#0f766e', '--meta-border': '#99f6e4' } as React.CSSProperties}
              >
                Scene: {tags.sceneId.slice(0, 8)}
              </span>
            )}
            {isFinite(tags.depth) && (
              <span
                className={styles.metaTag}
                style={{ '--meta-bg': '#f8fafc', '--meta-fg': '#334155', '--meta-border': '#e2e8f0' } as React.CSSProperties}
              >
                Depth: {tags.depth}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* NARRATIVE section */}
        <FieldGroup label="Narrative" icon="📖" defaultOpen>
          <div className={styles.sectionFields}>
            <Field
              label="Node ID"
              value={node.id}
              onChange={() => {}}
              disabled
            />
            <Field
              label="Title"
              value={node.title}
              onChange={(v) => updateNode(node.id, { title: v })}
            />
            <SelectField
              label="Node type"
              value={node.node_type}
              options={NODE_TYPES as string[]}
              onChange={(v) => updateNode(node.id, { node_type: v as NodeType })}
            />
            <div className={styles.narrativeField}>
              <div className={styles.narrativeHeader}>
                <label className={styles.narrativeLabel} htmlFor={`${node.id}-narrative`}>
                  Narrative text
                </label>
                <button
                  type="button"
                  className={styles.ttsButton}
                  disabled
                  title="Coming soon"
                  aria-label="TTS preview (coming soon)"
                >
                  📢 TTS
                </button>
              </div>
              <textarea
                id={`${node.id}-narrative`}
                className={styles.narrativeTextarea}
                value={node.narrativeText}
                onChange={(e) => updateNode(node.id, { narrativeText: e.target.value })}
                rows={6}
              />
            </div>
          </div>
        </FieldGroup>

        {/* AUDIO section */}
        <FieldGroup label="Audio" icon="🔊" defaultOpen={false}>
          <div className={styles.sectionFields}>
            <AudioComboField
              label="Entry foley"
              value={node.entry_foley ?? ''}
              onChange={(v) => updateNode(node.id, { entry_foley: v || undefined })}
              suggestions={audioSuggestions}
            />
            <AudioComboField
              label="Music"
              value={node.music ?? ''}
              onChange={(v) => updateNode(node.id, { music: v || undefined })}
              suggestions={audioSuggestions}
            />
            <AudioComboField
              label="Sounds"
              value={node.sounds ?? ''}
              onChange={(v) => updateNode(node.id, { sounds: v || undefined })}
              suggestions={audioSuggestions}
            />
          </div>
        </FieldGroup>

        {/* GAMEPLAY section */}
        <FieldGroup label="Gameplay" icon="🎮" defaultOpen={false}>
          <div className={styles.sectionFields}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={node.checkpoint ?? false}
                onChange={(e) => updateNode(node.id, { checkpoint: e.target.checked || undefined })}
              />
              <span>Checkpoint</span>
            </label>
            <ActivitiesList
              activities={node.activities ?? []}
              onChange={(activities) => updateNode(node.id, { activities: activities.length > 0 ? activities : undefined })}
            />
          </div>
        </FieldGroup>

        {/* CHOICES section */}
        <FieldGroup label={`Choices (${node.choices.length})`} defaultOpen>
          <div className={styles.sectionFields}>
            {isTerminal ? (
              <p className={styles.terminalMessage}>Terminal nodes cannot have choices.</p>
            ) : (
              <>
                {node.choices.length === 0 ? (
                  <p className={styles.emptyChoices}>No choices yet.</p>
                ) : (
                  node.choices.map((choice, i) => (
                    <CompanionChoiceRow
                      key={i}
                      choice={choice}
                      choiceIndex={i}
                      nodeId={node.id}
                      allNodes={allNodes}
                      onUpdate={(patch) => updateChoice(node.id, i, patch)}
                      onDelete={() => deleteChoice(node.id, i)}
                      onCreateAndLink={() => handleCreateAndLink(i)}
                    />
                  ))
                )}
                <button
                  type="button"
                  className={styles.addChoiceButton}
                  onClick={handleAddChoice}
                >
                  + Add choice
                </button>
              </>
            )}
          </div>
        </FieldGroup>
      </div>

      {/* Panel footer */}
      <footer className={styles.footer}>
        {!isStart && (
          deleteConfirm ? (
            <div className={styles.deleteConfirm}>
              <span className={styles.deleteConfirmText}>Delete this node?</span>
              <button
                type="button"
                className={`${styles.footerButton} ${styles.footerButtonDanger}`}
                onClick={handleDeleteNode}
              >
                Confirm delete
              </button>
              <button
                type="button"
                className={styles.footerButton}
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={`${styles.footerButton} ${styles.footerButtonDanger}`}
              onClick={() => setDeleteConfirm(true)}
            >
              Delete node
            </button>
          )
        )}
        <span className={styles.footerNodeId}>{node.id}</span>
      </footer>
    </aside>
  )
}
