import { useEffect, useRef } from 'react'
import type { AdventureMetadata } from '../../types/adventure'
import styles from './OpenDialog.module.css'

interface OpenDialogProps {
  isOpen: boolean
  metadata: AdventureMetadata[]
  onSelect: (id: string) => void
  onClose: () => void
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function OpenDialog({ isOpen, metadata, onSelect, onClose }: OpenDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      if (!dialog.open) dialog.showModal()
    } else {
      if (dialog.open) dialog.close()
    }
  }, [isOpen])

  // Sync close when user presses Escape (native dialog cancel event).
  function handleCancel(e: React.SyntheticEvent<HTMLDialogElement>) {
    e.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="open-dialog-heading"
      onCancel={handleCancel}
    >
      <div className={styles.header}>
        <h2 id="open-dialog-heading" className={styles.heading}>
          Open adventure
        </h2>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {metadata.length === 0 ? (
        <p className={styles.empty}>No saved adventures found.</p>
      ) : (
        <ul className={styles.list} role="list">
          {metadata.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemDate}>{formatDate(item.savedAt)}</span>
              </div>
              <button
                type="button"
                className={styles.openButton}
                onClick={() => onSelect(item.id)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.footer}>
        <button type="button" className={styles.cancelButton} onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
