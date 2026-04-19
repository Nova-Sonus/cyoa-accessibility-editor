import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { deriveIssues } from '../IssuesPanel/deriveIssues'
import { IssuesPanel } from '../IssuesPanel/IssuesPanel'
import { AssetManifest, deriveAssetManifest } from '../AssetManifest'
import { NodeIndex } from '../NodeIndex/NodeIndex'
import { NodeRow } from './NodeRow'
import { TERMINAL_NODE_TYPES } from '../../types/adventure'
import styles from './OutlineView.module.css'

interface OutlineViewProps {
  /**
   * When set, the outline will scroll to and focus the title input of this
   * node on the next render.  Consumed once — the caller should clear it via
   * `onFocusConsumed` to allow it to be re-used for future activations.
   */
  focusNodeId?: string | null
  /** Called immediately after the pending focus has been applied. */
  onFocusConsumed?: () => void
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

export function OutlineView({ focusNodeId, onFocusConsumed }: OutlineViewProps = {}) {
  const document = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const saveAdventure = useAdventureStore((s) => s.saveAdventure)
  const addNode = useAdventureStore((s) => s.addNode)

  // ---- Announcement state -------------------------------------------------
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
  const issues = useMemo(
    () => deriveIssues(document, classifierCache),
    [document, classifierCache],
  )

  // ---- aria-live count announcement ---------------------------------------
  const prevIssueCountRef = useRef<number | null>(null)

  useEffect(() => {
    const count = issues.length
    const prev = prevIssueCountRef.current

    if (prev === null) {
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

  // ---- Save adventure -----------------------------------------------------
  const [repositoryError, setRepositoryError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setRepositoryError(null)
    setIsSaving(true)
    try {
      await saveAdventure()
      announce('Adventure saved.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed.'
      setRepositoryError(message)
    } finally {
      setIsSaving(false)
    }
  }, [saveAdventure, announce])

  // ---- Focus management — new node or issue activation -------------------
  const [focusTargetId, setFocusTargetId] = useState<string | null>(null)

  useEffect(() => {
    if (focusNodeId) {
      setFocusTargetId(focusNodeId)
      onFocusConsumed?.()
    }
  }, [focusNodeId, onFocusConsumed])

  const handleNewNodeCreated = useCallback((newNodeId: string) => {
    setFocusTargetId(newNodeId)
  }, [])

  const handleActivateIssue = useCallback((nodeId: string) => {
    setFocusTargetId(nodeId)
  }, [])

  const handleFocusApplied = useCallback(() => {
    setFocusTargetId(null)
  }, [])

  // ---- Add node -----------------------------------------------------------
  const handleAddNode = useCallback(() => {
    const id = crypto.randomUUID()
    addNode({
      id,
      title: 'New node',
      node_type: 'narrative',
      narrativeText: '',
      choices: [],
    })
    setFocusTargetId(id)
  }, [addNode])

  // ---- allNodeIds — stable list for ChoiceRow selects --------------------
  const allNodeIds = useMemo(() => document.map((n) => n.id), [document])

  // ---- Audio suggestions — unique filenames across the document ----------
  const audioSuggestions = useMemo(
    () => deriveAssetManifest(document).map((e) => e.filename),
    [document],
  )

  // ---- Stats — derived from document + classifierCache -------------------
  const stats = useMemo(() => {
    const totalNodes = document.length
    const totalChoices = document.reduce((sum, n) => sum + n.choices.length, 0)
    const checkpoints = document.filter((n) => classifierCache.get(n.id)?.isCheckpoint).length
    const terminals = document.filter((n) =>
      TERMINAL_NODE_TYPES.includes(n.node_type),
    ).length
    return { totalNodes, totalChoices, checkpoints, terminals }
  }, [document, classifierCache])

  // ---- Node index entries — derived from document -----------------------
  const nodeIndexEntries = useMemo(
    () =>
      document.map((n) => ({
        id: n.id,
        title: n.title,
        node_type: n.node_type,
        checkpoint: n.checkpoint,
      })),
    [document],
  )

  // ---- Empty state --------------------------------------------------------
  if (document.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  return (
    <div className={styles.layout}>
      {/*
       * Consolidated aria-live region. All field-commit and count-change
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

      {/* Main node-list column */}
      <div className={styles.nodeListColumn}>
        {/* Stats bar */}
        <section aria-label="Document statistics" className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.totalNodes}</span>
            <span className={styles.statLabel}>{stats.totalNodes === 1 ? 'node' : 'nodes'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.totalChoices}</span>
            <span className={styles.statLabel}>{stats.totalChoices === 1 ? 'choice' : 'choices'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.checkpoints}</span>
            <span className={styles.statLabel}>{stats.checkpoints === 1 ? 'checkpoint' : 'checkpoints'}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats.terminals}</span>
            <span className={styles.statLabel}>{stats.terminals === 1 ? 'terminal' : 'terminals'}</span>
          </div>
        </section>

        <ul aria-label="Adventure outline">
          {document.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              tags={classifierCache.get(node.id) ?? {
                isOrphan: false,
                isTerminal: false,
                isJunction: false,
                isBranch: false,
                isLinearLink: false,
                isCheckpoint: false,
                sceneId: null,
                depth: Infinity,
                unreachable: false,
              }}
              audioSuggestions={audioSuggestions}
              onAnnounce={announce}
              onChoicesCleared={handleChoicesCleared}
              allNodeIds={allNodeIds}
              onNewNodeCreated={handleNewNodeCreated}
              focusTitleOnMount={focusTargetId === node.id}
              onFocusApplied={handleFocusApplied}
            />
          ))}
        </ul>

        {/* Add node */}
        <div className={styles.addNodeWrapper}>
          <button
            type="button"
            className={styles.addNodeButton}
            onClick={handleAddNode}
          >
            + Add node
          </button>
        </div>

        <div className={styles.saveWrapper}>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => { void handleSave() }}
            disabled={isSaving}
          >
            {isSaving ? 'Saving…' : 'Save adventure'}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={styles.sidebar} aria-label="Sidebar">
        <div className={styles.sidebarWidget}>
          <h2 className={styles.widgetHeading}>Node index</h2>
          <NodeIndex nodes={nodeIndexEntries} onActivate={handleActivateIssue} />
        </div>

        <div className={`${styles.sidebarWidget} ${issues.length > 0 || repositoryError ? styles.sidebarWidgetAmber : styles.sidebarWidgetGreen}`}>
          <IssuesPanel
            issues={issues}
            onActivate={handleActivateIssue}
            repositoryError={repositoryError}
          />
        </div>

        <div className={styles.sidebarWidget}>
          <AssetManifest document={document} compact />
        </div>
      </aside>
    </div>
  )
}
