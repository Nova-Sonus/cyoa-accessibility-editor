import type { Adventure } from '../../types/adventure'
import styles from './SpotlightBreadcrumb.module.css'

export interface SpotlightBreadcrumbProps {
  breadcrumb: readonly string[]
  allNodes: Adventure
  onNavigate: (index: number) => void
  onClear: () => void
}

export function SpotlightBreadcrumb({
  breadcrumb,
  allNodes,
  onNavigate,
  onClear,
}: SpotlightBreadcrumbProps) {
  if (breadcrumb.length === 0) return null

  function resolveTitle(id: string): string {
    return allNodes.find((n) => n.id === id)?.title ?? id
  }

  return (
    <nav aria-label="Spotlight trail" className={styles.trail}>
      <ol className={styles.crumbs}>
        {breadcrumb.map((nodeId, index) => {
          const isCurrent = index === breadcrumb.length - 1
          return (
            <li key={nodeId} className={styles.item}>
              {index > 0 && (
                <span className={styles.sep} aria-hidden="true">
                  ›
                </span>
              )}
              {isCurrent ? (
                <span className={styles.crumbCurrent} aria-current="true">
                  {resolveTitle(nodeId)}
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.crumb}
                  onClick={() => onNavigate(index)}
                >
                  {resolveTitle(nodeId)}
                </button>
              )}
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className={styles.clearBtn}
        aria-label="Clear spotlight"
        onClick={onClear}
      >
        ✕
      </button>
    </nav>
  )
}
