import { useState, useCallback, useRef, useMemo } from 'react'
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
 * adventure nodes.  Covers title, node_type, narrativeText, and full choice
 * editing with a nextNode select that includes a "Create new node" affordance.
 *
 * Design decisions:
 * - Single `aria-live="polite" aria-atomic="true"` region prevents announcement
 *   storms when multiple fields change in quick succession.
 * - Semantic HTML only (`<ul>`, `<details>`, `<textarea>`, `<select>`,
 *   `<button>`, `<label>`) — no `role="application"`.
 * - Issues panel surfaces: (a) nodes where a terminal-type transition cleared
 *   pre-existing choices, and (b) dangling nextNode references (computed
 *   reactively from the live document — surfaced within one render cycle of
 *   the causative mutation, satisfying the OPS-530 AC).
 * - Focus management: when a stub node is created via the nextNode combobox,
 *   OutlineView directs focus to that node's title field.
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

  // ---- Issues panel — terminal-transition events --------------------------
  const [terminalIssues, setTerminalIssues] = useState<IssueEntry[]>([])

  const handleChoicesCleared = useCallback(
    (nodeId: string, count: number) => {
      // Find the node title from the *current* document snapshot.
      const node = document.find((n) => n.id === nodeId)
      const nodeTitle = node?.title ?? nodeId
      setTerminalIssues((prev) => [
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

  // ---- Issues panel — dangling nextNode references (reactive) -------------
  // Computed from the live document on every render, so a single `deleteNode`
  // call surfaces any orphaned choice references within one render cycle.
  const danglingIssues = useMemo<IssueEntry[]>(() => {
    const nodeIds = new Set(document.map((n) => n.id))
    const result: IssueEntry[] = []
    for (const node of document) {
      for (const choice of node.choices) {
        if (choice.nextNode !== '' && !nodeIds.has(choice.nextNode)) {
          result.push({
            nodeId: node.id,
            nodeTitle: node.title,
            message: `Choice "${choice.choiceText || '(unnamed)'}" references missing node "${choice.nextNode}".`,
          })
        }
      }
    }
    return result
  }, [document])

  const allIssues = [...terminalIssues, ...danglingIssues]

  // ---- Focus management — new node created via nextNode combobox ----------
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null)

  const handleNewNodeCreated = useCallback((newNodeId: string) => {
    setFocusTargetId(newNodeId)
  }, [])

  const handleFocusApplied = useCallback(() => {
    setFocusTargetId(null)
  }, [])

  // ---- allNodeIds — stable list for ChoiceRow selects ---------------------
  const allNodeIds = useMemo(() => document.map((n) => n.id), [document])

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
            allNodeIds={allNodeIds}
            onNewNodeCreated={handleNewNodeCreated}
            focusTitleOnMount={focusTargetId === node.id}
            onFocusApplied={handleFocusApplied}
          />
        ))}
      </ul>

      {allIssues.length > 0 && (
        <section aria-label="Issues">
          <h2>Issues</h2>
          <ul>
            {allIssues.map((issue, i) => (
              <li key={`${issue.nodeId}-${i}`}>
                <strong>{issue.nodeTitle}</strong>: {issue.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
