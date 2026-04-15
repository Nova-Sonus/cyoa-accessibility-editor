import { useState, useCallback, useRef } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { NodeRow } from './NodeRow'

interface IssueEntry {
  nodeId: string
  nodeTitle: string
  message: string
}

/**
 * Visually hides an element while keeping it available to assistive technology.
 * Applied to the consolidated `aria-live` region so it does not occupy visual
 * space but still surfaces announcements to JAWS and other screen readers.
 */
const visuallyHiddenStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  borderWidth: 0,
}

/**
 * Outline view — a keyboard-navigable, screen-reader-friendly list of all
 * adventure nodes.  MVP fields: `title`, `node_type`, `narrativeText`.
 *
 * Design decisions:
 * - Single `aria-live="polite" aria-atomic="true"` region prevents announcement
 *   storms when multiple fields change in quick succession.
 * - Semantic HTML only (`<ul>`, `<details>`, `<textarea>`, `<select>`,
 *   `<button>`, `<label>`) — no `role="application"`.
 * - Issues panel surfaces nodes where a terminal-type transition cleared
 *   pre-existing choices; this panel is extended in OPS-530.
 */
export function OutlineView() {
  const document = useAdventureStore((s) => s.document)

  // ---- Announcement state -------------------------------------------------
  // Clear-then-set pattern ensures identical messages re-trigger screen reader
  // announcement.  The 50 ms gap is below perception threshold for sighted
  // users but sufficient for browser accessibility APIs to fire a mutation.
  const [announcement, setAnnouncement] = useState('')
  const announcerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const announce = useCallback((message: string) => {
    if (announcerTimerRef.current !== null) {
      clearTimeout(announcerTimerRef.current)
    }
    setAnnouncement('')
    announcerTimerRef.current = setTimeout(() => {
      setAnnouncement(message)
    }, 50)
  }, [])

  // ---- Issues panel -------------------------------------------------------
  const [issues, setIssues] = useState<IssueEntry[]>([])

  const handleChoicesCleared = useCallback(
    (nodeId: string, count: number) => {
      // Find the node title from the *current* document snapshot.
      const node = document.find((n) => n.id === nodeId)
      const nodeTitle = node?.title ?? nodeId
      setIssues((prev) => [
        // De-duplicate: replace any existing issue for the same node.
        ...prev.filter((i) => i.nodeId !== nodeId),
        {
          nodeId,
          nodeTitle,
          message: `${count} ${count === 1 ? 'choice' : 'choices'} removed — terminal nodes cannot have choices.`,
        },
      ])
    },
    [document],
  )

  // ---- Empty state --------------------------------------------------------
  if (document.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  return (
    <div>
      {/*
       * Consolidated aria-live region.  All field-commit announcements are
       * routed here so only one region fires per interaction — no storms.
       */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={visuallyHiddenStyle}
      >
        {announcement}
      </div>

      <ul aria-label="Adventure outline">
        {document.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            onAnnounce={announce}
            onChoicesCleared={handleChoicesCleared}
          />
        ))}
      </ul>

      {issues.length > 0 && (
        <section aria-label="Issues">
          <h2>Issues</h2>
          <ul>
            {issues.map((issue) => (
              <li key={issue.nodeId}>
                <strong>{issue.nodeTitle}</strong>: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
