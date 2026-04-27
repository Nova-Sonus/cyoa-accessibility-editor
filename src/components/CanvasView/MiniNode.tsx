import type { AdventureNode } from '../../types/adventure'
import type { ClassifierTags } from '../../classifier'
import { NODE_COLOURS } from '../../styles/tokens'
import styles from './MiniNode.module.css'

export type SpotlightState = 'focus' | 'neighbour' | 'dimmed' | 'normal'

export interface MiniNodeProps {
  node: AdventureNode
  tags: ClassifierTags
  spotlightState?: SpotlightState
  onActivate: (nodeId: string) => void
}

const SPOTLIGHT_CLASS: Record<SpotlightState, string | undefined> = {
  normal: undefined,
  focus: styles.spotlightFocus,
  neighbour: styles.spotlightNeighbour,
  dimmed: styles.spotlightDimmed,
}

export function MiniNode({ node, tags, spotlightState = 'normal', onActivate }: MiniNodeProps) {
  const colours = NODE_COLOURS[node.node_type]
  const typeLabel = node.node_type.replace(/_/g, ' ')

  const metaParts = [
    typeLabel,
    tags.isCheckpoint ? 'checkpoint' : '',
    tags.isOrphan ? 'orphan' : '',
    tags.unreachable ? 'unreachable' : '',
  ].filter(Boolean)

  const spotlightClass = SPOTLIGHT_CLASS[spotlightState]
  const className = spotlightClass != null
    ? `${styles.miniNode} ${spotlightClass}`
    : styles.miniNode

  return (
    <button
      type="button"
      className={className}
      data-spotlight={spotlightState !== 'normal' ? spotlightState : undefined}
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
