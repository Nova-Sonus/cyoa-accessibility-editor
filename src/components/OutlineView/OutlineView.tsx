import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { deriveIssues } from '../IssuesPanel/deriveIssues'
import { IssuesPanel } from '../IssuesPanel/IssuesPanel'
import { AssetManifest } from '../AssetManifest'
import { NodeRow } from './NodeRow'

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
 * - Issues panel is always visible; it shows a "No issues found" message when
 *   the document is structurally clean, satisfying OPS-531 AC.
 * - All issues are derived reactively from the live document and classifierCache
 *   on every render — a single store mutation surfaces its consequences within
 *   one render cycle.
 * - Consolidated aria-live region announces the issue count when it changes,
 *   not once per issue — prevents announcement storms.
 * - Focus management: activating an issue item, or creating a stub node via the
 *   nextNode combobox, moves focus to the target node's title field.
 */
export function OutlineView() {
  const document = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)

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

  // ---- Reactive issues — derived from document + classifierCache ----------
  // A single useMemo replaces the previous combination of event-driven
  // terminalIssues state and danglingIssues memo.  All issue categories
  // (orphan, unreachable, dangling-reference, terminal-with-choices) are now
  // computed in one pass and reflect the live document within one render cycle.
  const issues = useMemo(
    () => deriveIssues(document, classifierCache),
    [document, classifierCache],
  )

  // ---- aria-live count announcement ---------------------------------------
  // Announce the new issue count whenever it changes, but only after the
  // initial render (when the user has not yet interacted with the document).
  const prevIssueCountRef = useRef<number | null>(null)

  useEffect(() => {
    const count = issues.length
    const prev = prevIssueCountRef.current

    if (prev === null) {
      // First render — record the baseline without announcing.
      prevIssueCountRef.current = count
      return
    }

    if (count === prev) return

    prevIssueCountRef.current = count

    if (count === 0) {
      announce('No issues.')
    } else if (count > prev) {
      announce(`${count} ${count === 1 ? 'issue' : 'issues'} found.`)
    } else {
      announce(`${count} ${count === 1 ? 'issue' : 'issues'} remaining.`)
    }
  }, [issues.length, announce])

  // ---- Terminal-transition announcement -----------------------------------
  // When a node transitions to a terminal type the store clears any pre-existing
  // choices in the same transaction — the document is never transiently invalid.
  // Because choices are cleared the reactive issues list won't flag the node,
  // so we surface the event as a one-off announcement instead of a persistent
  // issue entry.
  const handleChoicesCleared = useCallback(
    (nodeId: string, count: number) => {
      const node = document.find((n) => n.id === nodeId)
      const nodeTitle = node?.title ?? nodeId
      announce(
        `${count} ${count === 1 ? 'choice' : 'choices'} removed from "${nodeTitle}" — terminal nodes cannot have choices.`,
      )
    },
    [document, announce],
  )

  // ---- Focus management — new node or issue activation -------------------
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null)

  const handleNewNodeCreated = useCallback((newNodeId: string) => {
    setFocusTargetId(newNodeId)
  }, [])

  const handleActivateIssue = useCallback((nodeId: string) => {
    setFocusTargetId(nodeId)
  }, [])

  const handleFocusApplied = useCallback(() => {
    setFocusTargetId(null)
  }, [])

  // ---- allNodeIds — stable list for ChoiceRow selects --------------------
  const allNodeIds = useMemo(() => document.map((n) => n.id), [document])

  // ---- Empty state --------------------------------------------------------
  if (document.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  return (
    <div>
      {/*
       * Consolidated aria-live region.  All field-commit and count-change
       * announcements are routed here so only one region fires per interaction.
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

      <IssuesPanel issues={issues} onActivate={handleActivateIssue} />

      <AssetManifest document={document} />
    </div>
  )
}
