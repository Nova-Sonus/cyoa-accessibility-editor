import { createStore } from 'zustand/vanilla'
import { devtools } from 'zustand/middleware'
import { classifyAll } from '../classifier'
import type { ClassifierTags, NodeId } from '../classifier'
import type { AdventureRepository } from '../repository'
import type { Adventure, AdventureNode, Choice } from '../types/adventure'
import { isTerminalNodeType } from '../types/adventure'
import { StoreActionError } from './errors'

// ---------------------------------------------------------------------------
// State and action types
// ---------------------------------------------------------------------------

/** Read-only state exposed to consumers. */
export interface AdventureState {
  /** ID of the currently loaded adventure, or null when none is loaded. */
  adventureId: string | null

  /** The live adventure document conforming to CYOA_Schema.json. */
  document: Adventure

  /**
   * Memoised classifier output keyed by node id.
   *
   * Recomputed after every mutation. Object references for structurally
   * unchanged nodes are preserved across mutations so that selector equality
   * checks remain stable and downstream components avoid unnecessary
   * re-renders.
   */
  classifierCache: ReadonlyMap<NodeId, ClassifierTags>
}

/** Async and sync actions exposed to consumers. */
export interface AdventureActions {
  /**
   * Load the adventure with the given id from the repository.
   * Replaces the current document and resets the classifier cache.
   */
  loadAdventure(id: string): Promise<void>

  /**
   * Persist the current document back to the repository.
   * @throws {Error} if no adventure is currently loaded.
   */
  saveAdventure(): Promise<void>

  /**
   * Append a new node to the document.
   * Updates both `document` and `classifierCache` in a single transaction.
   */
  addNode(node: AdventureNode): void

  /**
   * Apply a partial patch to an existing node.
   *
   * The `id` field is immutable and cannot be changed via this action.
   * If the patch transitions `node_type` to a terminal type (`end` or
   * `adventure_success`), the `choices` array is cleared as part of the same
   * transaction so the resulting document always satisfies the schema.
   *
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  updateNode(nodeId: string, patch: Partial<Omit<AdventureNode, 'id'>>): void

  /**
   * Remove a node from the document.
   *
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  deleteNode(nodeId: string): void

  /**
   * Append a choice to an existing non-terminal node.
   *
   * @throws {StoreActionError} TERMINAL_NODE_MUTATION if the node is terminal.
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  addChoice(nodeId: string, choice: Choice): void

  /**
   * Apply a partial patch to an existing choice at `choiceIndex`.
   *
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  updateChoice(nodeId: string, choiceIndex: number, patch: Partial<Choice>): void

  /**
   * Remove the choice at `choiceIndex` from a node.
   *
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  deleteChoice(nodeId: string, choiceIndex: number): void

  /**
   * Atomically create a stub node and link it as the `nextNode` of the choice
   * at `choiceIndex` on `nodeId`.
   *
   * The stub has `node_type: 'narrative'`, an empty `narrativeText`, and an
   * empty `choices` array.  Its id is a UUID generated via `crypto.randomUUID`.
   *
   * Both the new node and the updated choice are written in a single
   * `set()` call so the document is never transiently invalid.
   *
   * @returns The id of the newly created node.
   * @throws {StoreActionError} NODE_NOT_FOUND if `nodeId` is absent.
   */
  createNodeAndLinkChoice(nodeId: string, choiceIndex: number): string
}

export type AdventureStoreState = AdventureState & AdventureActions

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compares two ClassifierTags objects by value.
 * Used to decide whether to reuse the old tag reference.
 */
function tagsEqual(a: ClassifierTags, b: ClassifierTags): boolean {
  return (
    a.isOrphan === b.isOrphan &&
    a.isTerminal === b.isTerminal &&
    a.isJunction === b.isJunction &&
    a.isBranch === b.isBranch &&
    a.isLinearLink === b.isLinearLink &&
    a.isCheckpoint === b.isCheckpoint &&
    a.sceneId === b.sceneId &&
    a.depth === b.depth &&
    a.unreachable === b.unreachable
  )
}

/**
 * Runs `classifyAll` on `newDocument` and merges the result with `oldCache`,
 * reusing the previous tag object reference for any node whose structural
 * properties are unchanged.
 *
 * Reusing references keeps Zustand selector equality checks stable: a selector
 * that returns `classifierCache.get(nodeId)` will receive the same object and
 * skip a re-render whenever that node's structure did not change.
 */
function updateClassifierCache(
  oldCache: ReadonlyMap<NodeId, ClassifierTags>,
  newDocument: Adventure,
): ReadonlyMap<NodeId, ClassifierTags> {
  const fresh = classifyAll(newDocument)

  // Fast path: first load, nothing to merge.
  if (oldCache.size === 0) return fresh

  const merged = new Map<NodeId, ClassifierTags>()
  for (const [id, freshTags] of fresh) {
    const oldTags = oldCache.get(id)
    merged.set(
      id,
      oldTags !== undefined && tagsEqual(oldTags, freshTags) ? oldTags : freshTags,
    )
  }
  return merged
}

/**
 * Locate a node by id and return its index, or throw StoreActionError
 * NODE_NOT_FOUND when absent.
 */
function requireNodeIndex(document: Adventure, nodeId: string): number {
  const idx = document.findIndex((n) => n.id === nodeId)
  if (idx === -1) {
    throw new StoreActionError(`Node "${nodeId}" not found in document`, 'NODE_NOT_FOUND')
  }
  return idx
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

/**
 * Creates a Zustand vanilla store for the active adventure document.
 *
 * The `repository` is bound at construction time and never imported directly
 * by application code — it is injected at the composition root so that the
 * storage backend can be swapped without touching this module.
 *
 * The returned store can be exercised in isolation from React via
 * `store.getState()` and `store.setState()`, satisfying the requirement that
 * store actions are unit-testable without rendering a component.
 */
export function createAdventureStore(repository: AdventureRepository) {
  return createStore<AdventureStoreState>()(
    devtools(
      (set, get) => ({
        // ---- initial state ------------------------------------------------
        adventureId: null,
        document: [],
        classifierCache: new Map<NodeId, ClassifierTags>(),

        // ---- async persistence -------------------------------------------

        loadAdventure: async (id) => {
          const adventure = await repository.load(id)
          set(
            {
              adventureId: id,
              document: adventure,
              classifierCache: classifyAll(adventure),
            },
            false,
            'loadAdventure',
          )
        },

        saveAdventure: async () => {
          const { adventureId, document } = get()
          if (adventureId === null) {
            throw new Error('saveAdventure: no adventure is currently loaded')
          }
          await repository.save(adventureId, document)
        },

        // ---- node mutations ----------------------------------------------

        addNode: (node) => {
          const newDocument = [...get().document, node]
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'addNode',
          )
        },

        updateNode: (nodeId, patch) => {
          const currentDocument = get().document
          const idx = requireNodeIndex(currentDocument, nodeId)
          const currentNode = currentDocument[idx]!

          // Determine the effective node_type after the patch is applied.
          const newNodeType = patch.node_type ?? currentNode.node_type
          const willBeTerminal = isTerminalNodeType(newNodeType)

          const updatedNode: AdventureNode = {
            ...currentNode,
            ...patch,
            // id is immutable — always restore it even if the caller included it
            id: currentNode.id,
            // Terminal nodes must have an empty choices array (schema if/then).
            // Clear choices in the same transaction rather than rejecting so
            // the author is never left with an invalid document.
            ...(willBeTerminal ? { choices: [] } : {}),
          }

          const newDocument = [
            ...currentDocument.slice(0, idx),
            updatedNode,
            ...currentDocument.slice(idx + 1),
          ]

          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'updateNode',
          )
        },

        deleteNode: (nodeId) => {
          const currentDocument = get().document
          requireNodeIndex(currentDocument, nodeId) // throws if absent
          const newDocument = currentDocument.filter((n) => n.id !== nodeId)
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'deleteNode',
          )
        },

        // ---- choice mutations --------------------------------------------

        addChoice: (nodeId, choice) => {
          const currentDocument = get().document
          const idx = requireNodeIndex(currentDocument, nodeId)
          const node = currentDocument[idx]!

          if (isTerminalNodeType(node.node_type)) {
            throw new StoreActionError(
              `Cannot add a choice to terminal node "${nodeId}" (node_type: ${node.node_type})`,
              'TERMINAL_NODE_MUTATION',
            )
          }

          const updatedNode: AdventureNode = {
            ...node,
            choices: [...node.choices, choice],
          }
          const newDocument = [
            ...currentDocument.slice(0, idx),
            updatedNode,
            ...currentDocument.slice(idx + 1),
          ]
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'addChoice',
          )
        },

        updateChoice: (nodeId, choiceIndex, patch) => {
          const currentDocument = get().document
          const idx = requireNodeIndex(currentDocument, nodeId)
          const node = currentDocument[idx]!

          const updatedChoices = node.choices.map((c, i) =>
            i === choiceIndex ? { ...c, ...patch } : c,
          )
          const updatedNode: AdventureNode = { ...node, choices: updatedChoices }
          const newDocument = [
            ...currentDocument.slice(0, idx),
            updatedNode,
            ...currentDocument.slice(idx + 1),
          ]
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'updateChoice',
          )
        },

        deleteChoice: (nodeId, choiceIndex) => {
          const currentDocument = get().document
          const idx = requireNodeIndex(currentDocument, nodeId)
          const node = currentDocument[idx]!

          const updatedChoices = node.choices.filter((_, i) => i !== choiceIndex)
          const updatedNode: AdventureNode = { ...node, choices: updatedChoices }
          const newDocument = [
            ...currentDocument.slice(0, idx),
            updatedNode,
            ...currentDocument.slice(idx + 1),
          ]
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'deleteChoice',
          )
        },

        createNodeAndLinkChoice: (nodeId, choiceIndex) => {
          const currentDocument = get().document
          const idx = requireNodeIndex(currentDocument, nodeId)
          const node = currentDocument[idx]!

          const stubNode: AdventureNode = {
            id: crypto.randomUUID(),
            title: 'New node',
            node_type: 'narrative',
            narrativeText: '',
            choices: [],
          }

          const updatedChoices = node.choices.map((c, i) =>
            i === choiceIndex ? { ...c, nextNode: stubNode.id } : c,
          )
          const updatedNode: AdventureNode = { ...node, choices: updatedChoices }

          const newDocument = [
            ...currentDocument.slice(0, idx),
            updatedNode,
            ...currentDocument.slice(idx + 1),
            stubNode,
          ]
          set(
            {
              document: newDocument,
              classifierCache: updateClassifierCache(get().classifierCache, newDocument),
            },
            false,
            'createNodeAndLinkChoice',
          )

          return stubNode.id
        },
      }),
      { name: 'adventure-store' },
    ),
  )
}

/** Type alias for the store returned by `createAdventureStore`. */
export type AdventureStore = ReturnType<typeof createAdventureStore>
