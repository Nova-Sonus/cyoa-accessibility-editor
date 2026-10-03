import { useMemo, useCallback } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { MiniNode } from './MiniNode'
import type { SpotlightState } from './MiniNode'
import { SceneLane } from './SceneLane'
import { SpotlightBreadcrumb } from './SpotlightBreadcrumb'
import { NodeDetail } from './NodeDetail'
import { InterSceneConnectors } from './InterSceneConnectors'
import { useSpotlight } from './useSpotlight'
import { groupByScene, getInterSceneEdges } from './canvasUtils'
import styles from './CanvasView.module.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeSpotlightState(
  nodeId: string,
  focusNodeId: string | null,
  spotlightNodeIds: ReadonlySet<string> | null,
): SpotlightState {
  if (spotlightNodeIds === null) return 'normal'
  if (nodeId === focusNodeId) return 'focus'
  if (spotlightNodeIds.has(nodeId)) return 'neighbour'
  return 'dimmed'
}

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

export function CanvasView({ onNodeActivate }: CanvasViewProps) {
  const adventureDoc = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const setSelectedNodeId = useAdventureStore((s) => s.setSelectedNodeId)

  const spotlight = useSpotlight(adventureDoc)
  const { focusNodeId, spotlightNodeIds, breadcrumb, activate, clear, navigateTo } = spotlight

  const sceneMap = useMemo(
    () => groupByScene(adventureDoc, classifierCache),
    [adventureDoc, classifierCache],
  )

  const interSceneEdges = useMemo(
    () => getInterSceneEdges(adventureDoc, classifierCache),
    [adventureDoc, classifierCache],
  )

  const preambleNodes = useMemo(
    () => adventureDoc.filter((n) => (classifierCache.get(n.id)?.sceneId ?? null) === null),
    [adventureDoc, classifierCache],
  )

  const focusedNode = useMemo(
    () =>
      focusNodeId != null
        ? (adventureDoc.find((n) => n.id === focusNodeId) ?? null)
        : null,
    [focusNodeId, adventureDoc],
  )

  const focusedTags = focusNodeId != null ? (classifierCache.get(focusNodeId) ?? null) : null

  const handleNodeActivate = useCallback(
    (nodeId: string) => {
      activate(nodeId)
      setSelectedNodeId(nodeId)
    },
    [activate, setSelectedNodeId],
  )

  if (adventureDoc.length === 0) {
    return <p>No adventure loaded. Open a file to begin authoring.</p>
  }

  return (
    <div className={styles.canvasView}>
      <SpotlightBreadcrumb
        breadcrumb={breadcrumb}
        allNodes={adventureDoc}
        onNavigate={navigateTo}
        onClear={clear}
      />
      <div className={styles.layout}>
        {/* Swimlane area */}
        <div
          role="region"
          aria-label="Scene swimlanes"
          className={styles.swimlaneArea}
        >
          {preambleNodes.length > 0 && (
            <section className={styles.preamble} aria-label="Unscoped nodes">
              <p className={styles.preambleHeading}>Unscoped nodes</p>
              <div className={styles.preambleBody}>
                {preambleNodes.map((node) => {
                  const tags = classifierCache.get(node.id)
                  if (tags == null) return null
                  return (
                    <MiniNode
                      key={node.id}
                      node={node}
                      tags={tags}
                      spotlightState={computeSpotlightState(node.id, focusNodeId, spotlightNodeIds)}
                      onActivate={handleNodeActivate}
                    />
                  )
                })}
              </div>
            </section>
          )}
          {[...sceneMap.entries()].map(([sceneId, nodes]) => (
            <SceneLane
              key={sceneId}
              sceneId={sceneId}
              nodes={nodes}
              allNodes={adventureDoc}
              classifierCache={classifierCache}
              spotlightNodeIds={spotlightNodeIds}
              focusNodeId={focusNodeId}
              onNodeActivate={handleNodeActivate}
            />
          ))}
        </div>

        {/* Sidebar */}
        <div className={styles.sidebar}>
          <div className={styles.nodeDetailWrapper}>
            <NodeDetail
              node={focusedNode}
              tags={focusedTags}
              allNodes={adventureDoc}
              onActivate={handleNodeActivate}
              onEdit={onNodeActivate}
            />
          </div>
          <div className={styles.connectorsWrapper}>
            <InterSceneConnectors
              edges={interSceneEdges}
              allNodes={adventureDoc}
              onActivate={handleNodeActivate}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
