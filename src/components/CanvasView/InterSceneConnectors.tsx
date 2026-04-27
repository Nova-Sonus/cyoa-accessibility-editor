import type { Adventure } from '../../types/adventure'
import type { InterSceneEdge } from './canvasUtils'
import styles from './InterSceneConnectors.module.css'

export interface InterSceneConnectorsProps {
  edges: InterSceneEdge[]
  allNodes: Adventure
  /**
   * Called when the user activates an edge row.
   * Receives the id of the source node (edge.from) — the node that carries
   * the cross-scene choice.
   */
  onActivate: (nodeId: string) => void
}

export function InterSceneConnectors({
  edges,
  allNodes,
  onActivate,
}: InterSceneConnectorsProps) {
  function resolveTitle(id: string): string {
    return allNodes.find((n) => n.id === id)?.title ?? id
  }

  return (
    <section aria-label="Scene connections">
      <h2 className={styles.heading}>Scene connections</h2>
      {edges.length === 0 ? (
        <p className={styles.emptyMessage}>No inter-scene connections.</p>
      ) : (
        <ul className={styles.list}>
          {edges.map((edge) => (
            <li key={`${edge.from}-${edge.to}`}>
              <button
                type="button"
                className={styles.edgeButton}
                onClick={() => onActivate(edge.from)}
              >
                <span className={styles.sceneLine}>
                  <span className={styles.sceneName}>{resolveTitle(edge.fromScene)}</span>
                  <span className={styles.arrow} aria-hidden="true">→</span>
                  <span className={styles.sceneName}>{resolveTitle(edge.toScene)}</span>
                  {edge.isBack && (
                    <span className={styles.backBadge}>↩ back</span>
                  )}
                </span>
                {edge.label && (
                  <span className={styles.choiceLabel}>via &ldquo;{edge.label}&rdquo;</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
