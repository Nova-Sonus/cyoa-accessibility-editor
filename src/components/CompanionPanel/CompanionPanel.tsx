import { useId } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import type { NodeType } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier/types'
import type { ClassifierTagKey } from '../../styles/tokens'
import { NODE_COLOURS } from '../../styles/tokens'
import { TypeBadge, ClassifierTag, Field, SelectField } from '../ui'
import styles from './CompanionPanel.module.css'

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
  { field: 'isOrphan', key: 'orphan' },
  { field: 'unreachable', key: 'unreachable' },
  { field: 'isJunction', key: 'junction' },
  { field: 'isBranch', key: 'branch' },
  { field: 'isLinearLink', key: 'linear_link' },
  { field: 'isCheckpoint', key: 'checkpoint' },
]

export function CompanionPanel() {
  const selectedNodeId = useAdventureStore((s) => s.selectedNodeId)
  const document = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const updateNode = useAdventureStore((s) => s.updateNode)

  const narrativeId = useId()

  const node = selectedNodeId != null
    ? (document.find((n) => n.id === selectedNodeId) ?? null)
    : null
  const tags = selectedNodeId != null ? (classifierCache.get(selectedNodeId) ?? null) : null

  if (node == null) {
    return (
      <aside className={styles.panel} aria-label="Node editor">
        <p className={styles.placeholder}>Select a node to edit</p>
      </aside>
    )
  }

  const colours = NODE_COLOURS[node.node_type]

  return (
    <aside
      className={styles.panel}
      aria-label="Node editor"
      style={{ '--node-border': colours.border, '--node-bg': colours.bg } as React.CSSProperties}
    >
      <header className={styles.header}>
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

      <div className={styles.fields}>
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
            <label className={styles.narrativeLabel} htmlFor={narrativeId}>
              Narrative text
            </label>
            <button
              type="button"
              className={styles.ttsButton}
              disabled
              title="Coming soon"
              aria-label="TTS preview (coming soon)"
            >
              🔊 TTS
            </button>
          </div>
          <textarea
            id={narrativeId}
            className={styles.narrativeTextarea}
            value={node.narrativeText}
            onChange={(e) => updateNode(node.id, { narrativeText: e.target.value })}
            rows={6}
          />
        </div>
      </div>
    </aside>
  )
}
