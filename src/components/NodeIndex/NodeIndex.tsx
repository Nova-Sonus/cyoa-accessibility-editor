import { useRef, useCallback } from 'react'
import type { NodeType } from '../../types/adventure'
import { NODE_COLOURS } from '../../styles/tokens'
import styles from './NodeIndex.module.css'

export interface NodeIndexEntry {
  id: string
  title: string
  node_type: NodeType
  checkpoint?: boolean
}

export interface NodeIndexProps {
  nodes: NodeIndexEntry[]
  onActivate: (nodeId: string) => void
}

export function NodeIndex({ nodes, onActivate }: NodeIndexProps) {
  const listRef = useRef<HTMLUListElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const buttons = listRef.current?.querySelectorAll('button')
        const next = buttons?.[index + 1] as HTMLButtonElement | undefined
        next?.focus()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = listRef.current?.querySelectorAll('button')
        const prev = buttons?.[index - 1] as HTMLButtonElement | undefined
        prev?.focus()
      }
    },
    [],
  )

  return (
    <nav aria-label="Node index">
      <ul ref={listRef} className={styles.list}>
        {nodes.map((node, index) => {
          const colours = NODE_COLOURS[node.node_type]
          return (
            <li key={node.id} className={styles.item}>
              <button
                type="button"
                className={styles.button}
                onClick={() => onActivate(node.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
              >
                <span
                  className={styles.dot}
                  style={{ '--dot-colour': colours.badge } as React.CSSProperties}
                  aria-hidden="true"
                />
                <span className={styles.title}>{node.title}</span>
                {node.checkpoint === true && (
                  <span
                    className={styles.checkpointBar}
                    aria-hidden="true"
                    data-testid="checkpoint-indicator"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
