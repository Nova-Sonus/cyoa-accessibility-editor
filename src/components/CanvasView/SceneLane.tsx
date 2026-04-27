import { useState, useMemo } from 'react'
import type { Adventure, AdventureNode } from '../../types/adventure'
import type { ClassifierTags, NodeId } from '../../classifier'
import { NODE_COLOURS } from '../../styles/tokens'
import { getSceneFlowIndicators } from './canvasUtils'
import { MiniNode } from './MiniNode'
import styles from './SceneLane.module.css'

export interface SceneLaneProps {
  /** The id of the scene_start node that defines this scene. */
  sceneId: string
  /** Nodes whose classifier sceneId matches this scene. */
  nodes: AdventureNode[]
  /** Full adventure document — used to resolve scene titles and flow indicators. */
  allNodes: Adventure
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>
  /**
   * The set of node ids currently in the spotlight neighbourhood.
   * `null` means spotlight mode is inactive.
   */
  spotlightNodeIds: ReadonlySet<string> | null
  onNodeActivate: (nodeId: string) => void
}

export function SceneLane({
  sceneId,
  nodes,
  allNodes,
  classifierCache,
  spotlightNodeIds,
  onNodeActivate,
}: SceneLaneProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  const sceneTitle = useMemo(
    () => allNodes.find((n) => n.id === sceneId)?.title ?? sceneId,
    [allNodes, sceneId],
  )

  const checkpointCount = useMemo(
    () => nodes.filter((n) => classifierCache.get(n.id)?.isCheckpoint === true).length,
    [nodes, classifierCache],
  )

  const { inbound, outbound } = useMemo(
    () => getSceneFlowIndicators(allNodes, classifierCache, sceneId),
    [allNodes, classifierCache, sceneId],
  )

  const hasSpotlightNode = useMemo(
    () => spotlightNodeIds !== null && nodes.some((n) => spotlightNodeIds.has(n.id)),
    [spotlightNodeIds, nodes],
  )

  const laneColour = NODE_COLOURS['scene_start'].border

  function resolveSceneTitle(id: string): string {
    return allNodes.find((n) => n.id === id)?.title ?? id
  }

  const inboundList = [...inbound]
  const outboundList = [...outbound]

  return (
    <section
      className={styles.lane}
      style={
        {
          '--lane-border': laneColour,
        } as React.CSSProperties
      }
      aria-label={`Scene: ${sceneTitle}`}
      data-spotlighted={hasSpotlightNode ? '' : undefined}
    >
      <button
        type="button"
        className={styles.header}
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((c) => !c)}
      >
        <span className={styles.chevron} aria-hidden="true">
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className={styles.sceneTitle}>{sceneTitle}</span>
        <span className={styles.sceneBadge}>{sceneId.length > 8 ? `${sceneId.slice(0, 8)}…` : sceneId}</span>
        <span className={styles.countBadge}>
          {nodes.length} {nodes.length === 1 ? 'node' : 'nodes'}
        </span>
        {checkpointCount > 0 && (
          <span className={styles.checkpointBadge}>✓ {checkpointCount}</span>
        )}
        {inboundList.map((id) => (
          <span key={`in-${id}`} className={styles.flowIn}>
            ← {resolveSceneTitle(id)}
          </span>
        ))}
        {outboundList.map((id) => (
          <span key={`out-${id}`} className={styles.flowOut}>
            → {resolveSceneTitle(id)}
          </span>
        ))}
      </button>

      {!isCollapsed && (
        <div className={styles.body}>
          {nodes.map((node) => {
            const tags = classifierCache.get(node.id)
            if (tags == null) return null
            return (
              <MiniNode
                key={node.id}
                node={node}
                tags={tags}
                onActivate={onNodeActivate}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
