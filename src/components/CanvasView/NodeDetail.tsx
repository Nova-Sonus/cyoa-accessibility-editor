import type { Adventure } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'
import type { ClassifierTagKey } from '../../styles/tokens'
import { NODE_COLOURS } from '../../styles/tokens'
import { TypeBadge, ClassifierTag } from '../ui'
import styles from './NodeDetail.module.css'

// ---------------------------------------------------------------------------
// Classifier tag mapping (mirrors CompanionPanel)
// ---------------------------------------------------------------------------

type BoolTagField = keyof Pick<
  ClassifierTags,
  'isOrphan' | 'unreachable' | 'isJunction' | 'isBranch' | 'isLinearLink' | 'isCheckpoint'
>

const BOOL_TAGS: ReadonlyArray<{ field: BoolTagField; key: ClassifierTagKey }> = [
  { field: 'isOrphan',     key: 'orphan' },
  { field: 'unreachable',  key: 'unreachable' },
  { field: 'isJunction',   key: 'junction' },
  { field: 'isBranch',     key: 'branch' },
  { field: 'isLinearLink', key: 'linear_link' },
  { field: 'isCheckpoint', key: 'checkpoint' },
]

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NodeDetailProps {
  /** The spotlighted node to display; `null` renders the placeholder. */
  node: Adventure[number] | null
  /** Classifier tags for the node; `null` when the node is absent from the cache. */
  tags: ClassifierTags | null
  /** Full adventure document used to resolve choice-target titles. */
  allNodes: Adventure
  /** Called when the user follows a choice to spotlight a target node. */
  onActivate: (nodeId: string) => void
  /** Called when the user wants to open the node in outline view for editing. */
  onEdit?: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NodeDetail({ node, tags, allNodes, onActivate, onEdit }: NodeDetailProps) {
  if (node === null) {
    return (
      <aside className={styles.panel} aria-label="Node detail">
        <p className={styles.placeholder}>Spotlight a node to see its details.</p>
      </aside>
    )
  }

  const colours = NODE_COLOURS[node.node_type]
  const narrativeId = `nd-narrative-${node.id}`
  const choicesId = `nd-choices-${node.id}`

  function resolveTitle(id: string): string {
    return allNodes.find((n) => n.id === id)?.title ?? id
  }

  return (
    <aside
      className={styles.panel}
      aria-label="Node detail"
      style={
        {
          '--node-border': colours.border,
          '--node-bg': colours.bg,
        } as React.CSSProperties
      }
    >
      {/* Header: title, type badge, classifier tags */}
      <header className={styles.header}>
        <h2 className={styles.nodeTitle}>{node.title}</h2>
        <TypeBadge type={node.node_type} />
        {tags !== null && (
          <div className={styles.tagList}>
            {BOOL_TAGS.map(({ field, key }) =>
              tags[field] ? <ClassifierTag key={key} tag={key} /> : null,
            )}
            {tags.isTerminal && (
              <span
                className={styles.metaTag}
                style={
                  {
                    '--meta-bg': '#f1f5f9',
                    '--meta-fg': '#475569',
                    '--meta-border': '#cbd5e1',
                  } as React.CSSProperties
                }
              >
                Terminal
              </span>
            )}
            {tags.sceneId !== null && (
              <span
                className={styles.metaTag}
                style={
                  {
                    '--meta-bg': '#f0fdfa',
                    '--meta-fg': '#0f766e',
                    '--meta-border': '#99f6e4',
                  } as React.CSSProperties
                }
              >
                Scene: {tags.sceneId.slice(0, 8)}
              </span>
            )}
            {isFinite(tags.depth) && (
              <span
                className={styles.metaTag}
                style={
                  {
                    '--meta-bg': '#f8fafc',
                    '--meta-fg': '#334155',
                    '--meta-border': '#e2e8f0',
                  } as React.CSSProperties
                }
              >
                Depth: {tags.depth}
              </span>
            )}
          </div>
        )}
      </header>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* Narrative section */}
        <section className={styles.section} aria-labelledby={narrativeId}>
          <h3 id={narrativeId} className={styles.sectionHeading}>
            Narrative
          </h3>
          {node.narrativeText ? (
            <p className={styles.narrativeText}>{node.narrativeText}</p>
          ) : (
            <p className={styles.empty}>No narrative text.</p>
          )}
        </section>

        {/* Choices section */}
        <section className={styles.section} aria-labelledby={choicesId}>
          <h3 id={choicesId} className={styles.sectionHeading}>
            Choices ({node.choices.length})
          </h3>
          {node.choices.length === 0 ? (
            <p className={styles.empty}>No choices.</p>
          ) : (
            <ul className={styles.choiceList}>
              {node.choices.map((choice, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={styles.choiceButton}
                    onClick={() => onActivate(choice.nextNode)}
                  >
                    <span className={styles.choiceText}>
                      {choice.choiceText || '(untitled choice)'}
                    </span>
                    <span className={styles.choiceArrow} aria-hidden="true">
                      →
                    </span>
                    <span className={styles.choiceTarget}>
                      {resolveTitle(choice.nextNode)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer: node id + optional edit button */}
      <footer className={styles.footer}>
        <span className={styles.nodeId}>{node.id}</span>
        {onEdit != null && (
          <button
            type="button"
            className={styles.editButton}
            onClick={() => onEdit(node.id)}
          >
            Edit in outline
          </button>
        )}
      </footer>
    </aside>
  )
}
