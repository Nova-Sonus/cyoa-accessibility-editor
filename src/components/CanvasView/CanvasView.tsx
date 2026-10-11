import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { SpotlightBreadcrumb } from './SpotlightBreadcrumb'
import { NodeDetail } from './NodeDetail'
import { InterSceneConnectors } from './InterSceneConnectors'
import { FlowGraph } from './FlowGraph'
import { useSpotlight } from './useSpotlight'
import { usePanZoom } from './usePanZoom'
import { getInterSceneEdges } from './canvasUtils'
import { buildSceneGraph } from './sceneGraph'
import type { SceneGraph, SceneKey } from './sceneGraph'
import { layoutCanvas } from './sceneLayout'
import type { CanvasLayout } from './sceneLayout'
import { routeLinks } from './linkRouting'
import { anchorView } from './relayout'
import type { Anchor } from './relayout'
import { useRelayoutTween } from './useRelayoutTween'
import styles from './CanvasView.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scenes expanded when an adventure is first shown: the scene holding the
 * selected node, or else the first group (the opening).
 */
export function initialExpanded(graph: SceneGraph, selectedNodeId: string | null): Set<SceneKey> {
  const key = selectedNodeId === null ? undefined : graph.groupOf.get(selectedNodeId)
  if (key !== undefined) return new Set([key])
  return new Set(graph.groups.slice(0, 1).map((g) => g.key))
}

/**
 * How the view should follow the next re-layout, when an action knows better
 * than the default (keep the selected node still and in view).
 */
interface RelayoutRequest {
  anchor: Anchor | null
  keepVisible: readonly string[]
}

/** The view was already placed for the new layout: leave it alone. */
const VIEW_ALREADY_PLACED: RelayoutRequest = { anchor: null, keepVisible: [] }

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CanvasViewProps {
  /** Called when the user activates "Edit in outline" — switches to outline view. */
  onNodeActivate: (nodeId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Flow canvas (OPS-577): the adventure drawn left to right as collapsible
 * scene boxes with routed links, plus the spotlight breadcrumb and the
 * NodeDetail / Scene connections sidebar.
 *
 * Expanded scenes are UI state only — never written to the document.  The
 * scene holding the selected node is opened automatically, and navigating to
 * a node from the sidebar or breadcrumb expands its scene and centres it.
 */
export function CanvasView({ onNodeActivate }: CanvasViewProps) {
  const adventureDoc = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const adventureId = useAdventureStore((s) => s.adventureId)
  const selectedNodeId = useAdventureStore((s) => s.selectedNodeId)
  const setSelectedNodeId = useAdventureStore((s) => s.setSelectedNodeId)
  const createNodeAndLinkChoice = useAdventureStore((s) => s.createNodeAndLinkChoice)

  const { focusNodeId, spotlightNodeIds, breadcrumb, activate, clear, navigateTo } =
    useSpotlight(adventureDoc)

  const graph = useMemo(() => buildSceneGraph(adventureDoc), [adventureDoc])
  const nodesById = useMemo(() => new Map(adventureDoc.map((n) => [n.id, n])), [adventureDoc])
  const interSceneEdges = useMemo(
    () => getInterSceneEdges(adventureDoc, classifierCache),
    [adventureDoc, classifierCache],
  )

  // ---- Expanded scenes ------------------------------------------------------
  const [expanded, setExpanded] = useState<ReadonlySet<SceneKey>>(
    () => initialExpanded(graph, selectedNodeId),
  )

  // A different adventure starts from its own default.
  const [expandedFor, setExpandedFor] = useState(adventureId)
  if (expandedFor !== adventureId) {
    setExpandedFor(adventureId)
    setExpanded(initialExpanded(graph, selectedNodeId))
  }

  // Whenever the selection changes (here, in the outline or the companion
  // panel) make sure the selected node's scene is open.
  const [revealedId, setRevealedId] = useState(selectedNodeId)
  if (revealedId !== selectedNodeId) {
    setRevealedId(selectedNodeId)
    const key = selectedNodeId === null ? undefined : graph.groupOf.get(selectedNodeId)
    if (key !== undefined && !expanded.has(key)) setExpanded(new Set([...expanded, key]))
  }

  const layout = useMemo(() => layoutCanvas(graph, expanded), [graph, expanded])
  const links = useMemo(() => routeLinks(graph, layout), [graph, layout])

  // ---- Pan / zoom -----------------------------------------------------------
  const viewportRef = useRef<HTMLDivElement>(null)
  const {
    view, zoomIn, zoomOut, reset, fit, centreOn, showStart, setView, viewportSize, pointerHandlers,
  } = usePanZoom(viewportRef, clear, adventureDoc.length > 0)

  // ---- Re-layout: anchoring and animation (OPS-583) --------------------------
  // Runs before paint after every render that changed the layout (an edit, a
  // scene toggle, a new selection): by default the selected node keeps its
  // place on screen and it, and any node just created, are kept in view.
  // The tween then eases cards, links and this adjusted view in step.
  const settled = useRef<{ layout: CanvasLayout; graph: SceneGraph; adventureId: string | null }>(
    { layout, graph, adventureId },
  )
  const relayoutRequest = useRef<RelayoutRequest | null>(null)
  useLayoutEffect(() => {
    const before = settled.current
    const request = relayoutRequest.current
    settled.current = { layout, graph, adventureId }
    relayoutRequest.current = null
    if (before.layout === layout || before.adventureId !== adventureId) return

    const selected = selectedNodeId !== null && layout.nodes.has(selectedNodeId) ? selectedNodeId : null
    const created = [...layout.nodes.keys()].filter((id) => !before.graph.groupOf.has(id))
    const { anchor, keepVisible } = request ?? {
      anchor: selected !== null && before.layout.nodes.has(selected) ? { node: selected } : null,
      keepVisible: selected === null ? created : [selected, ...created],
    }
    const [w, h] = viewportSize()
    const next = anchorView(view, before.layout, layout, anchor, keepVisible, w, h)
    if (next !== view) setView(next)
  })

  const shown = useRelayoutTween({ layout, links, view }, adventureId)

  // After "Add choice", keyboard focus follows the selection to the new card
  // (the button it was on belongs to the previous focus node and is removed).
  const [focusCardId, setFocusCardId] = useState<string | null>(null)
  useEffect(() => {
    if (focusCardId === null) return
    setFocusCardId(null)
    const slot = [...(viewportRef.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? [])]
      .find((el) => el.dataset.nodeId === focusCardId)
    slot?.querySelector('button')?.focus({ preventScroll: true })
  }, [focusCardId])

  // Once per adventure, once the viewport has a size: bring the start node
  // into view on the left (a tall opening scene can otherwise hide it).
  const openedFor = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (adventureDoc.length === 0 || openedFor.current === adventureId) return
    const root = graph.groups[0]?.rootIds[0]
    const box = root === undefined ? undefined : layout.nodes.get(root)
    if (box === undefined || showStart(box.y + box.height / 2)) openedFor.current = adventureId
  })

  // ---- Actions --------------------------------------------------------------
  /** Opens or closes a scene; its header stays put on screen. */
  const toggleScene = useCallback((key: SceneKey) => {
    relayoutRequest.current = { anchor: { scene: key }, keepVisible: [] }
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /** Expands the node's scene if needed and centres the node in the view. */
  const reveal = useCallback((nodeId: string) => {
    const key = graph.groupOf.get(nodeId)
    let next = expanded
    if (key !== undefined && !expanded.has(key)) {
      next = new Set([...expanded, key])
      relayoutRequest.current = VIEW_ALREADY_PLACED
      setExpanded(next)
    }
    const box = layoutCanvas(graph, next).nodes.get(nodeId)
    if (box !== undefined) centreOn(box.x + box.width / 2, box.y + box.height / 2)
  }, [graph, expanded, centreOn])

  /** A node card on the canvas was activated: spotlight and select it. */
  const handleNodeActivate = useCallback((nodeId: string) => {
    activate(nodeId)
    setSelectedNodeId(nodeId)
  }, [activate, setSelectedNodeId])

  /**
   * "Add choice" on a card: one store transaction appends a choice and the
   * new node it leads to, which is then selected, spotlighted and focused.
   * The source card stays still while the new node is kept in view.
   */
  const handleAddChoice = useCallback((nodeId: string) => {
    const source = nodesById.get(nodeId)
    if (source === undefined) return
    const newId = createNodeAndLinkChoice(nodeId, source.choices.length)
    relayoutRequest.current = { anchor: { node: nodeId }, keepVisible: [newId, nodeId] }
    handleNodeActivate(newId)
    setFocusCardId(newId)
  }, [nodesById, createNodeAndLinkChoice, handleNodeActivate])

  /** A node was chosen from the sidebar: also bring it into view. */
  const handleNodeNavigate = useCallback((nodeId: string) => {
    reveal(nodeId)
    handleNodeActivate(nodeId)
  }, [reveal, handleNodeActivate])

  const handleBreadcrumbNavigate = useCallback((index: number) => {
    const nodeId = breadcrumb[index]
    if (nodeId !== undefined) reveal(nodeId)
    navigateTo(index)
  }, [breadcrumb, reveal, navigateTo])

  // ---- Render ---------------------------------------------------------------
  if (adventureDoc.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  const focusedNode = focusNodeId === null ? null : (nodesById.get(focusNodeId) ?? null)
  const focusedTags = focusNodeId === null ? null : (classifierCache.get(focusNodeId) ?? null)
  const zoomPercent = `${Math.round(view.zoom * 100)}%`

  return (
    <div className={styles.canvasView}>
      <div role="toolbar" aria-label="Canvas controls" className={styles.toolbar}>
        <button type="button" className={styles.toolButton} onClick={zoomOut} aria-label="Zoom out">
          −
        </button>
        <span className={styles.zoomLevel} aria-live="polite" aria-atomic="true">
          {zoomPercent}
        </span>
        <button type="button" className={styles.toolButton} onClick={zoomIn} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => fit(layout.width, layout.height)}
        >
          Fit to view
        </button>
        <button type="button" className={styles.toolButton} onClick={reset}>
          Reset view
        </button>
        <span className={styles.toolbarGap} />
        <button
          type="button"
          className={styles.toolButton}
          onClick={() => setExpanded(new Set(graph.groups.map((g) => g.key)))}
        >
          Expand all scenes
        </button>
        <button type="button" className={styles.toolButton} onClick={() => setExpanded(new Set())}>
          Collapse all scenes
        </button>
      </div>

      <SpotlightBreadcrumb
        breadcrumb={breadcrumb}
        allNodes={adventureDoc}
        onNavigate={handleBreadcrumbNavigate}
        onClear={clear}
      />

      <div className={styles.layout}>
        <div
          ref={viewportRef}
          role="region"
          aria-label={`Adventure graph: ${adventureDoc.length} nodes, ${graph.links.length} connections`}
          className={styles.viewport}
          {...pointerHandlers}
        >
          <FlowGraph
            graph={graph}
            layout={shown.layout}
            links={shown.links}
            nodesById={nodesById}
            classifierCache={classifierCache}
            view={shown.view}
            focusNodeId={focusNodeId}
            spotlightNodeIds={spotlightNodeIds}
            onNodeActivate={handleNodeActivate}
            onToggleScene={toggleScene}
            onAddChoice={handleAddChoice}
            entering={shown.entering}
            enterOpacity={shown.enterOpacity}
          />
        </div>

        <div className={styles.sidebar}>
          <div className={styles.nodeDetailWrapper}>
            <NodeDetail
              node={focusedNode}
              tags={focusedTags}
              allNodes={adventureDoc}
              onActivate={handleNodeNavigate}
              onEdit={onNodeActivate}
            />
          </div>
          <div className={styles.connectorsWrapper}>
            <InterSceneConnectors
              edges={interSceneEdges}
              allNodes={adventureDoc}
              onActivate={handleNodeNavigate}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
