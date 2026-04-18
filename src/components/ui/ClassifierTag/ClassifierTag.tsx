import type { ClassifierTagKey } from '../../../styles/tokens'
import { CLASSIFIER_BADGES } from '../../../styles/tokens'
import styles from './ClassifierTag.module.css'

interface Props {
  tag: ClassifierTagKey
}

export function ClassifierTag({ tag }: Props) {
  const cfg = CLASSIFIER_BADGES[tag]
  return (
    <span
      className={styles.tag}
      style={{
        '--tag-bg': cfg.bg,
        '--tag-fg': cfg.fg,
        '--tag-border': cfg.border,
      } as React.CSSProperties}
    >
      {cfg.label}
    </span>
  )
}
