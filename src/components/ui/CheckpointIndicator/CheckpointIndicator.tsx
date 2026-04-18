import styles from './CheckpointIndicator.module.css'

export function CheckpointIndicator() {
  return (
    <span className={styles.indicator}>
      <span className={styles.bar} aria-hidden="true" />
      Checkpoint
    </span>
  )
}
