import { useCallback, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import styles from './AppHeader.module.css'

type ActiveView = 'outline' | 'canvas'

interface AppHeaderProps {
  activeView: ActiveView
  onViewChange: (view: ActiveView) => void
  onNewAdventure: () => void
  onOpen?: () => void
  onSave?: () => void
  isSaving?: boolean
  saveError?: string | null
}

const TABS: { id: ActiveView; label: string; panelId: string; tabId: string }[] = [
  { id: 'outline', label: 'Outline', panelId: 'panel-outline', tabId: 'tab-outline' },
  { id: 'canvas',  label: 'Canvas',  panelId: 'panel-canvas',  tabId: 'tab-canvas'  },
]

export function AppHeader({
  activeView,
  onViewChange,
  onNewAdventure,
  onOpen,
  onSave,
  isSaving = false,
  saveError = null,
}: AppHeaderProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        const next = (index + 1) % TABS.length
        const tab = TABS[next]!
        onViewChange(tab.id)
        tabRefs.current[next]?.focus()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        const prev = (index - 1 + TABS.length) % TABS.length
        const tab = TABS[prev]!
        onViewChange(tab.id)
        tabRefs.current[prev]?.focus()
      }
    },
    [onViewChange],
  )

  return (
    <header className={styles.header}>
      <h1 className={styles.logotype}>Nova Sonus — CYOA Editor</h1>

      <div role="tablist" aria-label="View mode" className={styles.tablist}>
        {TABS.map((tab, index) => {
          const isSelected = activeView === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              id={tab.tabId}
              aria-selected={isSelected}
              aria-controls={tab.panelId}
              tabIndex={isSelected ? 0 : -1}
              className={`${styles.tab} ${isSelected ? styles.tabSelected : ''}`}
              onClick={() => onViewChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              ref={(el) => { tabRefs.current[index] = el }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.actionButton} onClick={onNewAdventure}>
          New adventure
        </button>
        <button
          type="button"
          className={styles.actionButton}
          onClick={onOpen}
          aria-disabled={onOpen === undefined}
        >
          Open
        </button>
        {onSave !== undefined && (
          <button
            type="button"
            className={`${styles.actionButton} ${styles.saveButton}`}
            onClick={onSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>

      {saveError != null && (
        <p role="alert" className={styles.saveError}>
          {saveError}
        </p>
      )}
    </header>
  )
}
