import type { Adventure, AdventureNode } from '../../types/adventure'
import type { ClassifierTags, NodeId } from '../../classifier'

export interface InterSceneEdge {
  from: string
  to: string
  label: string
  fromScene: string
  toScene: string
  isBack: boolean
}

/**
 * Returns the one-hop neighbourhood of a node: its direct children (via
 * choices) and its direct parents (nodes whose choices target it).
 */
export function getNeighbours(
  nodes: Adventure,
  nodeId: string,
): { parents: Set<string>; children: Set<string>; all: Set<string> } {
  const children = new Set<string>()
  const parents = new Set<string>()

  for (const node of nodes) {
    for (const choice of node.choices) {
      if (node.id === nodeId) children.add(choice.nextNode)
      if (choice.nextNode === nodeId) parents.add(node.id)
    }
  }

  return { parents, children, all: new Set([...parents, ...children]) }
}

/**
 * Returns every edge that crosses a scene boundary (both endpoints must have
 * a non-null sceneId and those sceneIds must differ).  `isBack` is true when
 * the target scene's depth in the graph is ≤ the source scene's depth —
 * indicating a backward or lateral jump between scenes.
 */
export function getInterSceneEdges(
  nodes: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): InterSceneEdge[] {
  const edges: InterSceneEdge[] = []

  for (const node of nodes) {
    const fromScene = classifierCache.get(node.id)?.sceneId ?? null
    if (fromScene === null) continue

    for (const choice of node.choices) {
      const toScene = classifierCache.get(choice.nextNode)?.sceneId ?? null
      if (toScene === null || toScene === fromScene) continue

      const fromSceneDepth = classifierCache.get(fromScene)?.depth ?? Infinity
      const toSceneDepth = classifierCache.get(toScene)?.depth ?? Infinity

      edges.push({
        from: node.id,
        to: choice.nextNode,
        label: choice.choiceText,
        fromScene,
        toScene,
        isBack: toSceneDepth <= fromSceneDepth,
      })
    }
  }

  return edges
}

/**
 * Partitions nodes by their classifier-derived sceneId.  Nodes with a null
 * sceneId (preamble, orphans, unreachable) are excluded — they do not belong
 * to any named scene swimlane.
 */
export function groupByScene(
  nodes: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
): Map<string, AdventureNode[]> {
  const groups = new Map<string, AdventureNode[]>()

  for (const node of nodes) {
    const sceneId = classifierCache.get(node.id)?.sceneId ?? null
    if (sceneId === null) continue

    let group = groups.get(sceneId)
    if (group === undefined) {
      group = []
      groups.set(sceneId, group)
    }
    group.push(node)
  }

  return groups
}

/**
 * Returns which other scenes have edges flowing into the given scene
 * (inbound) and which scenes the given scene sends edges to (outbound).
 * Only named scenes (non-null sceneId) are included on both sides.
 */
export function getSceneFlowIndicators(
  nodes: Adventure,
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>,
  sceneId: string,
): { inbound: Set<string>; outbound: Set<string> } {
  const inbound = new Set<string>()
  const outbound = new Set<string>()

  for (const node of nodes) {
    const nodeScene = classifierCache.get(node.id)?.sceneId ?? null

    for (const choice of node.choices) {
      const targetScene = classifierCache.get(choice.nextNode)?.sceneId ?? null
      if (nodeScene === targetScene) continue

      if (targetScene === sceneId && nodeScene !== null) inbound.add(nodeScene)
      if (nodeScene === sceneId && targetScene !== null) outbound.add(targetScene)
    }
  }

  return { inbound, outbound }
}
