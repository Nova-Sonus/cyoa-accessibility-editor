import { useState } from 'react'
import styles from './CompanionPanel.module.css'

export interface ActivitiesListProps {
  activities: string[]
  onChange: (activities: string[]) => void
}

export function ActivitiesList({ activities, onChange }: ActivitiesListProps) {
  const [draft, setDraft] = useState('')

  function handleAdd() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...activities, trimmed])
    setDraft('')
  }

  function handleDelete(index: number) {
    onChange(activities.filter((_, i) => i !== index))
  }

  return (
    <div className={styles.activitiesList}>
      <span className={styles.activitiesHeading}>Activities</span>
      {activities.length === 0 ? (
        <p className={styles.activitiesEmpty}>No activities yet.</p>
      ) : (
        <ul className={styles.activitiesUl}>
          {activities.map((act, i) => (
            <li key={i} className={styles.activityItem}>
              <span className={styles.activityText}>{act}</span>
              <button
                type="button"
                className={styles.activityDeleteBtn}
                onClick={() => handleDelete(i)}
                aria-label={`Delete activity: ${act}`}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.activityAddRow}>
        <input
          className={styles.activityInput}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New activity…"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          aria-label="New activity"
        />
        <button
          type="button"
          className={styles.activityAddBtn}
          onClick={handleAdd}
        >
          Add
        </button>
      </div>
    </div>
  )
}
