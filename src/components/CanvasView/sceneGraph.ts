import type { Adventure } from '../../types/adventure'
import type { NodeId } from '../../classifier'
import { bfsFromStarts, buildNodeMap } from '../../classifier/classifier'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Stable key for a scene group.  Scene groups use `scene:<scene_start id>`;
 * the two special groups use fixed keys that cannot collide with them.
 */
export type SceneKey = string

export const PREAMBLE_KEY: SceneKey = 'preamble'
export const UNREACHABLE_KEY: SceneKey = 'unreachable'

export function sceneKey(sceneStartId: NodeId): SceneKey {
  return `scene:${sceneStartId}`
}

export type SceneGroupKind = 'preamble' | 'scene' | 'unreachable'

/**
 * A self-contained group of nodes laid out as one box on the flow canvas.
 *
 * - `preamble`: everything reachable from `start` before the first scene.
 * - `scene`: a `scene_start` node (the entry) plus every node whose classifier
 *   `sceneId` is that scene.  Note the classifier places the `scene_start`
 *   node itself in its *parent's* scene; for layout it is the entry of its own.
 * - `unreachable`: nodes no start node can reach (orphans and their subtrees).
 */
export interface SceneGroup {
  key: SceneKey
  kind: SceneGroupKind
  /** The `scene_start` node id for scene groups; `null` otherwise. */
  sceneId: NodeId | null
  /** Tree roots: the start node(s), the scene entry, or unreachable seeds. */
  rootIds: NodeId[]
  /** Every node in the group, in breadth-first (tree) order. */
  nodeIds: NodeId[]
  /** Group containing the entry's home parent; `null` for non-scene groups. */
  parentKey: SceneKey | null
  /** Scenes entered from this group, in discovery order. */
  childKeys: SceneKey[]
}

/**
 * - `tree`: home-parent link — drawn as part of the left-to-right tree.
 * - `back`: within a group, to a node in the same or an earlier column.
 * - `cross`: any other non-tree link within a group.
 * - `scene`: into another scene through its entry (`scene_start`) node.
 * - `scene-cross`: into another group anywhere other than a scene entry.
 */
export type LinkKind = 'tree' | 'back' | 'cross' | 'scene' | 'scene-cross'

export interface ClassifiedLink {
  from: NodeId
  to: NodeId
  /** Index of the choice on the source node that creates this link. */
  choiceIndex: number
  label: string
  kind: LinkKind
}

export interface SceneGraph {
  /** Preamble first, then scenes in discovery order, unreachable last. */
  groups: SceneGroup[]
  groupOf: ReadonlyMap<NodeId, SceneKey>
  /** Node that first reaches each node; absent for group roots. */
  homeParent: ReadonlyMap<NodeId, NodeId>
  /** Same-group tree children of each node, in choice order. */
  treeChildren: ReadonlyMap<NodeId, readonly NodeId[]>
  /** Tree distance from the node's group root (roots are column 0). */
  column: ReadonlyMap<NodeId, number>
  /** Every choice link whose target exists, in document and choice order. */
  links: ClassifiedLink[]
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Derives the scene structure of an adventure for the flow canvas.
 *
 * Home parents for reachable nodes come from the classifier's BFS, so scene
 * membership and columns agree with classifier `sceneId` and `depth`.
 * Unreachable nodes get home parents from a second BFS restricted to
 * themselves, seeded first from nodes no other unreachable node links to.
 *
 * Pure and deterministic: the same document always yields the same result.
 * Choices pointing at missing nodes are ignored (the Issues panel reports
 * them).
 */
export function buildSceneGraph(nodes: Adventure): SceneGraph {
  const nodeMap = buildNodeMap(nodes)
  const { depth, parent } = bfsFromStarts(nodes, nodeMap)
  const homeParent = new Map<NodeId, NodeId>(parent)

  const startIds = nodes.filter((n) => n.node_type === 'start').map((n) => n.id)
  const unreachableRoots = growUnreachableForest(nodes, depth, homeParent)

  // Children of each node in the home-parent forest, in choice order.
  const forestChildren = new Map<NodeId, NodeId[]>()
  for (const node of nodes) {
    for (const choice of node.choices) {
      const target = choice.nextNode
      if (homeParent.get(target) !== node.id) continue
      const kids = forestChildren.get(node.id) ?? []
      if (!kids.includes(target)) kids.push(target)
      forestChildren.set(node.id, kids)
    }
  }

  // Walk the forest breadth-first, assigning each node a group and column.
  const groups: SceneGroup[] = []
  const groupByKey = new Map<SceneKey, SceneGroup>()
  const groupOf = new Map<NodeId, SceneKey>()
  const column = new Map<NodeId, number>()

  const openGroup = (
    key: SceneKey,
    kind: SceneGroupKind,
    sceneId: NodeId | null,
    parentKey: SceneKey | null,
  ): SceneGroup => {
    const group: SceneGroup = {
      key, kind, sceneId, rootIds: [], nodeIds: [], parentKey, childKeys: [],
    }
    groups.push(group)
    groupByKey.set(key, group)
    if (parentKey !== null) groupByKey.get(parentKey)!.childKeys.push(key)
    return group
  }

  const walk = (roots: NodeId[], rootKey: SceneKey, kind: SceneGroupKind) => {
    if (roots.length === 0) return
    const rootGroup = openGroup(rootKey, kind, null, null)
    rootGroup.rootIds.push(...roots)
    for (const id of roots) {
      groupOf.set(id, rootKey)
      column.set(id, 0)
    }

    const queue = [...roots]
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head]!
      const key = groupOf.get(id)!
      groupByKey.get(key)!.nodeIds.push(id)

      for (const child of forestChildren.get(id) ?? []) {
        // Only reachable scene_start nodes open a scene of their own.
        if (kind !== 'unreachable' && nodeMap.get(child)!.node_type === 'scene_start') {
          const childKey = sceneKey(child)
          const scene = openGroup(childKey, 'scene', child, key)
          scene.rootIds.push(child)
          groupOf.set(child, childKey)
          column.set(child, 0)
        } else {
          groupOf.set(child, key)
          column.set(child, column.get(id)! + 1)
        }
        queue.push(child)
      }
    }
  }

  walk(startIds, PREAMBLE_KEY, 'preamble')
  walk(unreachableRoots, UNREACHABLE_KEY, 'unreachable')

  const treeChildren = new Map<NodeId, readonly NodeId[]>()
  for (const [id, kids] of forestChildren) {
    const sameGroup = kids.filter((k) => groupOf.get(k) === groupOf.get(id))
    if (sameGroup.length > 0) treeChildren.set(id, sameGroup)
  }

  return {
    groups,
    groupOf,
    homeParent,
    treeChildren,
    column,
    links: classifyLinks(nodes, nodeMap, groupByKey, groupOf, homeParent, column),
  }
}

// ---------------------------------------------------------------------------
// Internal helpers (exported for direct unit testing)
// ---------------------------------------------------------------------------

/**
 * Assigns home parents to nodes the start BFS never reached, writing into
 * `homeParent`, and returns the roots of the resulting forest in seed order.
 *
 * Seeds are taken in document order, nodes with no unreachable predecessor
 * first, so an orphan heads its own subtree.  Pure cycles (every node has an
 * unreachable predecessor) are seeded from their first node in the document.
 */
export function growUnreachableForest(
  nodes: Adventure,
  reachedDepth: ReadonlyMap<NodeId, number>,
  homeParent: Map<NodeId, NodeId>,
): NodeId[] {
  const unreached = nodes.filter((n) => !reachedDepth.has(n.id))
  const unreachedIds = new Set(unreached.map((n) => n.id))

  const hasUnreachedPredecessor = new Set<NodeId>()
  for (const node of unreached) {
    for (const choice of node.choices) {
      if (unreachedIds.has(choice.nextNode) && choice.nextNode !== node.id) {
        hasUnreachedPredecessor.add(choice.nextNode)
      }
    }
  }

  const seeds = [
    ...unreached.filter((n) => !hasUnreachedPredecessor.has(n.id)),
    ...unreached.filter((n) => hasUnreachedPredecessor.has(n.id)),
  ]
  const byId = new Map(unreached.map((n) => [n.id, n]))
  const visited = new Set<NodeId>()
  const roots: NodeId[] = []

  for (const seed of seeds) {
    if (visited.has(seed.id)) continue
    visited.add(seed.id)
    roots.push(seed.id)
    const queue = [seed.id]
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head]!
      for (const choice of byId.get(id)!.choices) {
        const target = choice.nextNode
        if (!unreachedIds.has(target) || visited.has(target)) continue
        visited.add(target)
        homeParent.set(target, id)
        queue.push(target)
      }
    }
  }

  return roots
}

function classifyLinks(
  nodes: Adventure,
  nodeMap: ReadonlyMap<NodeId, Adventure[number]>,
  groupByKey: ReadonlyMap<SceneKey, SceneGroup>,
  groupOf: ReadonlyMap<NodeId, SceneKey>,
  homeParent: ReadonlyMap<NodeId, NodeId>,
  column: ReadonlyMap<NodeId, number>,
): ClassifiedLink[] {
  const links: ClassifiedLink[] = []
  // A source may hold several choices to the same target; only the first is
  // the tree link.
  const treeLinkDrawn = new Set<NodeId>()

  for (const node of nodes) {
    node.choices.forEach((choice, choiceIndex) => {
      const from = node.id
      const to = choice.nextNode
      if (!nodeMap.has(to)) return

      let kind: LinkKind
      const toGroup = groupByKey.get(groupOf.get(to)!)!
      if (groupOf.get(from) === toGroup.key) {
        if (homeParent.get(to) === from && !treeLinkDrawn.has(to)) {
          treeLinkDrawn.add(to)
          kind = 'tree'
        } else {
          kind = column.get(to)! <= column.get(from)! ? 'back' : 'cross'
        }
      } else {
        kind = toGroup.kind === 'scene' && toGroup.sceneId === to ? 'scene' : 'scene-cross'
      }

      links.push({ from, to, choiceIndex, label: choice.choiceText, kind })
    })
  }

  return links
}
