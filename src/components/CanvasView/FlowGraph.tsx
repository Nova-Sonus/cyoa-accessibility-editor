import { useId } from 'react'
import type { AdventureNode } from '../../types/adventure'
import type { ClassifierTags, NodeId } from '../../classifier'
import { NODE_COLOURS } from '../../styles/tokens'
import type { NodeColours } from '../../styles/tokens'
import { MiniNode } from './MiniNode'
import type { SpotlightState } from './MiniNode'
import type { SceneGraph, SceneGroup, SceneKey } from './sceneGraph'
import { DEFAULT_SCENE_METRICS } from './sceneLayout'
import type { CanvasLayout, SceneBox } from './sceneLayout'
import { toSvgPath } from './linkRouting'
import type { RoutedLink } from './linkRouting'
import type { View } from './usePanZoom'
import styles from './FlowGraph.module.css'

// ---------------------------------------------------------------------------
// Helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

/** Display title of a scene group. */
export function sceneTitle(group: SceneGroup, nodesById: ReadonlyMap<NodeId, AdventureNode>): string {
  if (group.kind === 'preamble') return 'Opening'
  if (group.kind === 'unreachable') return 'Unlinked nodes'
  return nodesById.get(group.sceneId!)?.title ?? group.sceneId!
}

/** "N nodes · C checkpoints · E endings" (zero counts after the first omitted). */
export function sceneSummary(
  group: SceneGroup,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  let checkpoints = 0
  let endings = 0
  for (const id of group.nodeIds) {
    const tags = classifierCache.get(id)
    if (tags?.isCheckpoint === true) checkpoints++
    if (tags?.isTerminal === true) endings++
  }
  const parts = [plural(group.nodeIds.length, 'node')]
  if (checkpoints > 0) parts.push(plural(checkpoints, 'checkpoint'))
  if (endings > 0) parts.push(plural(endings, 'ending'))
  return parts.join(' · ')
}

export type LinkStyle = 'tree' | 'back' | 'cross' | 'scene'

/** Visual style of a routed link; any loop-back is drawn as `back`. */
export function linkStyle(link: RoutedLink): LinkStyle {
  if (link.isBack) return 'back'
  if (link.kind === 'tree') return 'tree'
  if (link.kind === 'cross') return 'cross'
  return 'scene'
}

export function computeSpotlightState(
  nodeId: string,
  focusNodeId: string | null,
  spotlightNodeIds: ReadonlySet<string> | null,
): SpotlightState {
  if (spotlightNodeIds === null) return 'normal'
  if (nodeId === focusNodeId) return 'focus'
  if (spotlightNodeIds.has(nodeId)) return 'neighbour'
  return 'dimmed'
}

const LINK_STYLES: LinkStyle[] = ['tree', 'back', 'cross', 'scene']

const UNLINKED_COLOURS: NodeColours = {
  border: '#64748b', bg: '#f1f5f9', badge: '#64748b', text: '#334155',
}

function groupColours(group: SceneGroup): NodeColours {
  if (group.kind === 'preamble') return NODE_COLOURS.start
  if (group.kind === 'unreachable') return UNLINKED_COLOURS
  return NODE_COLOURS.scene_start
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FlowGraphProps {
  graph: SceneGraph
  layout: CanvasLayout
  links: readonly RoutedLink[]
  nodesById: ReadonlyMap<NodeId, AdventureNode>
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>
  view: View
  focusNodeId: string | null
  spotlightNodeIds: ReadonlySet<string> | null
  onNodeActivate: (nodeId: string) => void
  onToggleScene: (key: SceneKey) => void
}

/**
 * The flow canvas content: scene boxes laid out left to right, node cards
 * inside expanded scenes, and every routed link drawn as an SVG path on top.
 *
 * Accessibility: each scene is a labelled `<section>` whose heading holds the
 * collapse toggle (`aria-expanded`); node cards are buttons with descriptive
 * names.  The link layer is decorative (`aria-hidden`) — connection details
 * are available from NodeDetail and Scene connections in the sidebar.
 */
export function FlowGraph({
  graph,
  layout,
  links,
  nodesById,
  classifierCache,
  view,
  focusNodeId,
  spotlightNodeIds,
  onNodeActivate,
  onToggleScene,
}: FlowGraphProps) {
  const markerPrefix = `flow-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

  return (
    <div
      className={styles.world}
      style={
        {
          '--world-w': `${layout.width}px`,
          '--world-h': `${layout.height}px`,
          '--pan-x': `${view.x}px`,
          '--pan-y': `${view.y}px`,
          '--zoom': view.zoom,
        } as React.CSSProperties
      }
    >
      {graph.groups.map((group) => (
        <SceneBoxView
          key={group.key}
          group={group}
          box={layout.scenes.get(group.key)!}
          layout={layout}
          nodesById={nodesById}
          classifierCache={classifierCache}
          focusNodeId={focusNodeId}
          spotlightNodeIds={spotlightNodeIds}
          onNodeActivate={onNodeActivate}
          onToggleScene={onToggleScene}
        />
      ))}

      <svg
        className={styles.links}
        width={layout.width}
        height={layout.height}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          {LINK_STYLES.map((s) => (
            <marker
              key={s}
              id={`${markerPrefix}-${s}`}
              viewBox="0 0 10 10"
              refX="10"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles[`arrow_${s}`]} />
            </marker>
          ))}
        </defs>
        {links.map((link) => {
          const s = linkStyle(link)
          const emphasis = focusNodeId === null
            ? undefined
            : link.from === focusNodeId || link.to === focusNodeId ? 'focus' : 'dimmed'
          const emphasisClass = emphasis === 'focus'
            ? styles.linkFocus
            : emphasis === 'dimmed' ? styles.linkDimmed : undefined
          return (
            <path
              key={`${link.from}#${link.choiceIndex}`}
              d={toSvgPath(link.points)}
              className={[styles.link, styles[`link_${s}`], emphasisClass].filter(Boolean).join(' ')}
              markerEnd={`url(#${markerPrefix}-${s})`}
              data-link-style={s}
              data-emphasis={emphasis}
            />
          )
        })}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene box
// ---------------------------------------------------------------------------

interface SceneBoxViewProps {
  group: SceneGroup
  box: SceneBox
  layout: CanvasLayout
  nodesById: ReadonlyMap<NodeId, AdventureNode>
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>
  focusNodeId: string | null
  spotlightNodeIds: ReadonlySet<string> | null
  onNodeActivate: (nodeId: string) => void
  onToggleScene: (key: SceneKey) => void
}

function SceneBoxView({
  group,
  box,
  layout,
  nodesById,
  classifierCache,
  focusNodeId,
  spotlightNodeIds,
  onNodeActivate,
  onToggleScene,
}: SceneBoxViewProps) {
  const title = sceneTitle(group, nodesById)
  const summary = sceneSummary(group, classifierCache)
  const colours = groupColours(group)

  return (
    <section
      aria-label={`Scene: ${title}`}
      className={styles.scene}
      data-expanded={box.expanded ? '' : undefined}
      data-kind={group.kind}
      style={
        {
          '--x': `${box.x}px`,
          '--y': `${box.y}px`,
          '--w': `${box.width}px`,
          '--h': `${box.height}px`,
          '--header-h': `${box.expanded ? DEFAULT_SCENE_METRICS.headerHeight : box.height}px`,
          '--scene-border': colours.border,
          '--scene-bg': colours.bg,
          '--scene-text': colours.text,
        } as React.CSSProperties
      }
    >
      <h2 className={styles.sceneHeading}>
        <button
          type="button"
          className={styles.sceneToggle}
          aria-expanded={box.expanded}
          aria-label={`${title}, ${summary}`}
          onClick={() => onToggleScene(group.key)}
        >
          <span className={styles.sceneTitleRow} aria-hidden="true">
            <span className={styles.chevron}>{box.expanded ? '▾' : '▸'}</span>
            <span className={styles.sceneTitle}>{title}</span>
          </span>
          <span className={styles.sceneSummary} aria-hidden="true">{summary}</span>
        </button>
      </h2>

      {box.expanded && group.nodeIds.map((id) => {
        const node = nodesById.get(id)
        const tags = classifierCache.get(id)
        if (node === undefined || tags === undefined) return null
        const card = layout.nodes.get(id)!
        return (
          <div
            key={id}
            className={styles.nodeSlot}
            style={
              {
                '--x': `${card.x - box.x}px`,
                '--y': `${card.y - box.y}px`,
                '--w': `${card.width}px`,
                '--h': `${card.height}px`,
              } as React.CSSProperties
            }
          >
            <MiniNode
              node={node}
              tags={tags}
              spotlightState={computeSpotlightState(id, focusNodeId, spotlightNodeIds)}
              onActivate={onNodeActivate}
            />
          </div>
        )
      })}
    </section>
  )
}
