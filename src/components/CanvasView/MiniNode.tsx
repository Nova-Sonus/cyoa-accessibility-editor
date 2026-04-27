import type { AdventureNode } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'
import { NODE_COLOURS } from '../../styles/tokens'
import styles from './MiniNode.module.css'

export interface MiniNodeProps {
  node: AdventureNode
  tags: ClassifierTags
  onActivate: (nodeId: string) => void
}

export function MiniNode({ node, tags, onActivate }: MiniNodeProps) {
  const colours = NODE_COLOURS[node.node_type]
  const typeLabel = node.node_type.replace(/_/g, ' ')

  const metaParts = [
    typeLabel,
    tags.isCheckpoint ? 'checkpoint' : '',
    tags.isOrphan ? 'orphan' : '',
    tags.unreachable ? 'unreachable' : '',
  ].filter(Boolean)

  return (
    <button
      type="button"
      className={styles.miniNode}
      style={
        {
          '--mini-border': colours.border,
          '--mini-bg': colours.bg,
          '--mini-badge-bg': colours.badge,
          '--mini-text': colours.text,
        } as React.CSSProperties
      }
      onClick={() => onActivate(node.id)}
      aria-label={`${node.title} (${metaParts.join(', ')})`}
    >
      {tags.isCheckpoint && <span className={styles.checkpointBar} aria-hidden="true" />}
      <span className={styles.typeBadge} aria-hidden="true">
        {typeLabel}
      </span>
      <span className={styles.title} aria-hidden="true">
        {node.title}
      </span>
    </button>
  )
}
