import { useState, useId } from 'react'
import type { ReactNode } from 'react'
import styles from './FieldGroup.module.css'

interface Props {
  label: string
  icon?: string
  defaultOpen?: boolean
  children: ReactNode
}

export function FieldGroup({ label, icon, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true">
          ▶
        </span>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.label}>{label}</span>
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        {children}
      </div>
    </div>
  )
}
