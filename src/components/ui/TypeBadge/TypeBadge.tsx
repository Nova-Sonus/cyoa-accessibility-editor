import type { NodeType } from '../../../types/adventure'
import { NODE_COLOURS } from '../../../styles/tokens'
import styles from './TypeBadge.module.css'

interface Props {
  type: NodeType
}

export function TypeBadge({ type }: Props) {
  const colours = NODE_COLOURS[type]
  return (
    <span
      className={styles.badge}
      style={{
        '--badge-bg': colours.bg,
        '--badge-border': colours.border,
        '--badge-text': colours.text,
      } as React.CSSProperties}
    >
      {type.replace(/_/g, ' ')}
    </span>
  )
}
