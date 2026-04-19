import { NODE_COLOURS, CLASSIFIER_BADGES } from '../../styles/tokens'
import type { ClassifierTagKey } from '../../styles/tokens'
import type { NodeType } from '../../types/adventure'
import styles from './LegendBar.module.css'

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  start:             'Start',
  scene_start:       'Scene start',
  decision:          'Decision',
  narrative:         'Narrative',
  combat:            'Combat',
  puzzle:            'Puzzle',
  end:               'End',
  adventure_success: 'Success',
}

const NODE_TYPES = Object.keys(NODE_COLOURS) as NodeType[]
const CLASSIFIER_KEYS = Object.keys(CLASSIFIER_BADGES) as ClassifierTagKey[]

export function LegendBar() {
  return (
    <div className={styles.bar} aria-hidden="true">
      <div className={styles.group}>
        {NODE_TYPES.map((type) => {
          const colours = NODE_COLOURS[type]
          return (
            <span
              key={type}
              className={styles.swatch}
              style={{
                '--swatch-bg': colours.bg,
                '--swatch-border': colours.border,
                '--swatch-text': colours.text,
              } as React.CSSProperties}
            >
              <span
                className={styles.dot}
                style={{ '--dot-colour': colours.badge } as React.CSSProperties}
              />
              {NODE_TYPE_LABELS[type]}
            </span>
          )
        })}
      </div>

      <div className={styles.divider} />

      <div className={styles.group}>
        {CLASSIFIER_KEYS.map((key) => {
          const badge = CLASSIFIER_BADGES[key]
          return (
            <span
              key={key}
              className={styles.classifierSwatch}
              style={{
                '--swatch-bg': badge.bg,
                '--swatch-border': badge.border,
                '--swatch-text': badge.fg,
              } as React.CSSProperties}
            >
              {badge.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}
