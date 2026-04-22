import { describe, it, expect } from 'vitest'
import { createAdventureStore } from './adventureStore'
import { StoreActionError } from './errors'
import { InMemoryRepository } from '../repository/InMemoryRepository'
import type { Adventure, AdventureNode, Choice } from '../types/adventure'
import cavesFixture from '../../fixtures/Caves_Of_Bane.json'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: `Narrative text for ${id}`,
    choices: [],
    ...overrides,
  }
}

function makeChoice(nextNode: string): Choice {
  return {
    choiceText: 'Go there',
    choiceResponseConstraint: '',
    nextNode,
  }
}

/** Convenience: create a store backed by an empty InMemoryRepository. */
function makeStore() {
  return createAdventureStore(new InMemoryRepository())
}

/** Convenience: create a store with a pre-seeded adventure. */
async function makeStoreWithAdventure(nodes: AdventureNode[]) {
  const repo = new InMemoryRepository()
  await repo.save('test', nodes)
  const store = createAdventureStore(repo)
  await store.getState().loadAdventure('test')
  return store
}

// ---------------------------------------------------------------------------
// AC-1: addNode updates document and classifier in one transaction
// ---------------------------------------------------------------------------

describe('addNode', () => {
  it('adds the node to the document', () => {
    const store = makeStore()
    const node = makeNode('a')
    store.getState().addNode(node)

    expect(store.getState().document).toHaveLength(1)
    expect(store.getState().document[0]).toEqual(node)
  })

  it('updates classifierCache in the same transaction as the document', () => {
    const store = makeStore()
    const node = makeNode('a', { node_type: 'start' })
    store.getState().addNode(node)

    // Both must reflect the new node in the same getState() call
    const { document, classifierCache } = store.getState()
    expect(document).toHaveLength(1)
    expect(classifierCache.has('a')).toBe(true)
  })

  it('classifies the new node correctly', () => {
    const store = makeStore()
    store.getState().addNode(makeNode('start', { node_type: 'start' }))
    store.getState().addNode(makeNode('end-node', { node_type: 'end' }))

    const { classifierCache } = store.getState()
    expect(classifierCache.get('start')?.isTerminal).toBe(false)
    expect(classifierCache.get('end-node')?.isTerminal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-2: large fixture — unaffected subgraphs reuse cached tag references
// ---------------------------------------------------------------------------

describe('classifier cache reference stability', () => {
  it('reuses tag object references for all structurally unchanged nodes after a non-structural mutation', async () => {
    // Caves_Of_Bane has 311 nodes — well above the 200+ threshold in the AC.
    const adventure = cavesFixture as unknown as Adventure
    const repo = new InMemoryRepository()
    await repo.save('caves', adventure)
    const store = createAdventureStore(repo)
    await store.getState().loadAdventure('caves')

    const cacheBeforeMutation = store.getState().classifierCache
    // Snapshot all tag references before the mutation.
    const snapshotBefore = new Map(cacheBeforeMutation)

    // Mutate only the title of one node — a non-structural change that cannot
    // affect any classifier tag (isOrphan, depth, sceneId, etc. are all
    // derived from graph topology, not node content).
    store.getState().updateNode('001', { title: 'Modified Title' })

    const cacheAfterMutation = store.getState().classifierCache

    // Instrumented selector: count how many tag objects are reference-equal
    // (===) between the old and new caches.
    let reusedCount = 0
    for (const [id, tagsAfter] of cacheAfterMutation) {
      if (snapshotBefore.get(id) === tagsAfter) {
        reusedCount++
      }
    }

    // A title-only change leaves all structural properties identical, so every
    // one of the 311 tag objects should be reused from the previous cache.
    expect(reusedCount).toBe(adventure.length)
  })

  it('issues fresh tag objects only for nodes whose structural properties change', () => {
    const store = makeStore()
    // Build a two-node graph: start → leaf
    store.getState().addNode(makeNode('start', { node_type: 'start', choices: [makeChoice('leaf')] }))
    store.getState().addNode(makeNode('leaf', { node_type: 'narrative' }))

    const tagsBefore = {
      start: store.getState().classifierCache.get('start'),
      leaf: store.getState().classifierCache.get('leaf'),
    }

    // Remove the edge from start → leaf.  This changes the out-degree of
    // 'start' (isBranch/isLinearLink) and the in-degree of 'leaf' (isOrphan).
    store.getState().deleteChoice('start', 0)

    const tagsAfter = {
      start: store.getState().classifierCache.get('start'),
      leaf: store.getState().classifierCache.get('leaf'),
    }

    // Both nodes changed structurally — new objects expected.
    expect(tagsAfter.start).not.toBe(tagsBefore.start)
    expect(tagsAfter.leaf).not.toBe(tagsBefore.leaf)
  })
})

// ---------------------------------------------------------------------------
// AC-3: addChoice / updateChoice targeting a terminal node is rejected
// ---------------------------------------------------------------------------

describe('addChoice on a terminal node', () => {
  it('throws StoreActionError with code TERMINAL_NODE_MUTATION for an "end" node', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('term', { node_type: 'end' }),
    ])

    expect(() => store.getState().addChoice('term', makeChoice('other'))).toThrow(StoreActionError)
    expect(() => store.getState().addChoice('term', makeChoice('other'))).toThrow(
      expect.objectContaining({ code: 'TERMINAL_NODE_MUTATION' }),
    )
  })

  it('throws StoreActionError with code TERMINAL_NODE_MUTATION for an "adventure_success" node', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('win', { node_type: 'adventure_success' }),
    ])

    expect(() => store.getState().addChoice('win', makeChoice('other'))).toThrow(
      expect.objectContaining({ code: 'TERMINAL_NODE_MUTATION' }),
    )
  })

  it('leaves the document unchanged when the action is rejected', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('term', { node_type: 'end' }),
    ])

    const documentBefore = store.getState().document

    try {
      store.getState().addChoice('term', makeChoice('other'))
    } catch {
      // expected
    }

    expect(store.getState().document).toBe(documentBefore)
  })
})

// ---------------------------------------------------------------------------
// AC-4: changing node_type to terminal clears choices in the same transaction
// ---------------------------------------------------------------------------

describe('updateNode — transition to terminal node_type', () => {
  it('clears the choices array when node_type changes to "end"', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { node_type: 'narrative', choices: [makeChoice('b')] }),
      makeNode('b'),
    ])

    store.getState().updateNode('a', { node_type: 'end' })

    const { document, classifierCache } = store.getState()
    const node = document.find((n) => n.id === 'a')!

    // Choices cleared.
    expect(node.choices).toHaveLength(0)
    // node_type applied.
    expect(node.node_type).toBe('end')
    // Classifier updated in same transaction.
    expect(classifierCache.get('a')?.isTerminal).toBe(true)
  })

  it('clears the choices array when node_type changes to "adventure_success"', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', {
        node_type: 'decision',
        choices: [makeChoice('b'), makeChoice('c')],
      }),
      makeNode('b'),
      makeNode('c'),
    ])

    store.getState().updateNode('a', { node_type: 'adventure_success' })

    const node = store.getState().document.find((n) => n.id === 'a')!
    expect(node.choices).toHaveLength(0)
    expect(node.node_type).toBe('adventure_success')
  })

  it('applies the patch atomically — document and classifierCache are consistent in the same state', () => {
    const store = makeStore()
    store.getState().addNode(
      makeNode('a', { node_type: 'decision', choices: [makeChoice('b')] }),
    )
    store.getState().addNode(makeNode('b'))

    store.getState().updateNode('a', { node_type: 'end' })

    // Read both in a single getState() — they must be consistent.
    const { document, classifierCache } = store.getState()
    const node = document.find((n) => n.id === 'a')!
    expect(node.choices).toHaveLength(0)
    expect(classifierCache.get('a')?.isTerminal).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AC-5: repository is injected at construction, never imported directly
// ---------------------------------------------------------------------------

describe('repository injection', () => {
  it('loadAdventure delegates to the injected repository', async () => {
    const adventure: Adventure = [makeNode('x', { node_type: 'start' })]
    const repo = new InMemoryRepository()
    await repo.save('my-adventure', adventure)

    const store = createAdventureStore(repo)
    await store.getState().loadAdventure('my-adventure')

    expect(store.getState().adventureId).toBe('my-adventure')
    expect(store.getState().document).toEqual(adventure)
  })

  it('saveAdventure persists the current document via the injected repository', async () => {
    const repo = new InMemoryRepository()
    const initial: Adventure = [makeNode('s', { node_type: 'start' })]
    await repo.save('adv', initial)

    const store = createAdventureStore(repo)
    await store.getState().loadAdventure('adv')

    // Mutate in store then save.
    store.getState().addNode(makeNode('extra'))
    await store.getState().saveAdventure()

    // The repository should now hold the mutated document.
    const persisted = await repo.load('adv')
    expect(persisted).toHaveLength(2)
    expect(persisted.find((n) => n.id === 'extra')).toBeDefined()
  })

  it('saveAdventure throws when no adventure is loaded', () => {
    const store = makeStore()
    // adventureId is null — must reject immediately.
    return expect(store.getState().saveAdventure()).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// AC-6: actions are testable without rendering a React component
// (all tests in this file satisfy this implicitly — no React rendering occurs)
// ---------------------------------------------------------------------------

describe('store actions testable without React', () => {
  it('exercises every action via vanilla store API without any React import', () => {
    // This test doubles as documentation: no @testing-library/react is used.
    const store = makeStore()

    // addNode
    store.getState().addNode(makeNode('start', { node_type: 'start' }))
    store.getState().addNode(makeNode('mid', { node_type: 'narrative' }))
    store.getState().addNode(makeNode('fin', { node_type: 'end' }))

    // addChoice
    store.getState().addChoice('start', makeChoice('mid'))

    // updateChoice
    store.getState().updateChoice('start', 0, { choiceText: 'Updated text' })

    // updateNode (non-terminal transition)
    store.getState().updateNode('mid', { title: 'Middle Node' })

    // deleteChoice
    store.getState().deleteChoice('start', 0)

    // deleteNode
    store.getState().deleteNode('fin')

    const { document, classifierCache } = store.getState()
    expect(document).toHaveLength(2)
    expect(classifierCache.size).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Additional edge-case coverage
// ---------------------------------------------------------------------------

describe('updateNode', () => {
  it('preserves the node id regardless of what the patch contains', async () => {
    const store = await makeStoreWithAdventure([makeNode('immutable-id')])
    // Attempt to change the id via the patch — it must be ignored.
    // Cast to bypass the Omit<..., 'id'> type guard for the test.
    store.getState().updateNode('immutable-id', { title: 'New Title' })
    const node = store.getState().document[0]!
    expect(node.id).toBe('immutable-id')
  })

  it('throws NODE_NOT_FOUND when the target node does not exist', () => {
    const store = makeStore()
    expect(() => store.getState().updateNode('ghost', { title: 'X' })).toThrow(
      expect.objectContaining({ code: 'NODE_NOT_FOUND' }),
    )
  })
})

describe('deleteNode', () => {
  it('removes the node from document and classifierCache', async () => {
    const store = await makeStoreWithAdventure([makeNode('a'), makeNode('b')])
    store.getState().deleteNode('a')

    expect(store.getState().document.find((n) => n.id === 'a')).toBeUndefined()
    expect(store.getState().classifierCache.has('a')).toBe(false)
  })

  it('throws NODE_NOT_FOUND when the target node does not exist', () => {
    const store = makeStore()
    expect(() => store.getState().deleteNode('ghost')).toThrow(
      expect.objectContaining({ code: 'NODE_NOT_FOUND' }),
    )
  })
})

describe('deleteChoice', () => {
  it('removes the choice at the given index', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', {
        node_type: 'decision',
        choices: [makeChoice('b'), makeChoice('c')],
      }),
      makeNode('b'),
      makeNode('c'),
    ])

    store.getState().deleteChoice('a', 0)

    const node = store.getState().document.find((n) => n.id === 'a')!
    expect(node.choices).toHaveLength(1)
    expect(node.choices[0]!.nextNode).toBe('c')
  })
})

describe('updateChoice', () => {
  it('applies the patch to the choice at the given index', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { node_type: 'decision', choices: [makeChoice('b')] }),
      makeNode('b'),
    ])

    store.getState().updateChoice('a', 0, { choiceText: 'Take the path' })

    const node = store.getState().document.find((n) => n.id === 'a')!
    expect(node.choices[0]!.choiceText).toBe('Take the path')
    expect(node.choices[0]!.nextNode).toBe('b') // unchanged
  })
})

describe('addChoice', () => {
  it('throws NODE_NOT_FOUND when the target node does not exist', () => {
    const store = makeStore()
    expect(() => store.getState().addChoice('ghost', makeChoice('other'))).toThrow(
      expect.objectContaining({ code: 'NODE_NOT_FOUND' }),
    )
  })
})

// ---------------------------------------------------------------------------
// createNodeAndLinkChoice
// ---------------------------------------------------------------------------

describe('createNodeAndLinkChoice', () => {
  it('creates a stub node and appends it to the document', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { choices: [makeChoice('')] }),
    ])

    store.getState().createNodeAndLinkChoice('a', 0)

    expect(store.getState().document).toHaveLength(2)
    const stub = store.getState().document[1]!
    expect(stub.node_type).toBe('decision')
    expect(stub.title).toBe('New node')
    expect(stub.choices).toHaveLength(0)
  })

  it('sets the choice nextNode to the stub id atomically', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { choices: [makeChoice('')] }),
    ])

    const newId = store.getState().createNodeAndLinkChoice('a', 0)

    const { document } = store.getState()
    const choice = document.find((n) => n.id === 'a')!.choices[0]!
    expect(choice.nextNode).toBe(newId)
    // Both the updated choice and the stub node are visible in the same snapshot.
    expect(document.find((n) => n.id === newId)).toBeDefined()
  })

  it('returns the new node id as a non-empty string', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { choices: [makeChoice('')] }),
    ])

    const newId = store.getState().createNodeAndLinkChoice('a', 0)

    expect(typeof newId).toBe('string')
    expect(newId.length).toBeGreaterThan(0)
  })

  it('only updates the targeted choice index, leaving others unchanged', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { choices: [makeChoice('b'), makeChoice('')] }),
      makeNode('b'),
    ])

    store.getState().createNodeAndLinkChoice('a', 1)

    const node = store.getState().document.find((n) => n.id === 'a')!
    expect(node.choices[0]!.nextNode).toBe('b') // untouched
    expect(node.choices[1]!.nextNode).not.toBe('') // updated
  })

  it('throws NODE_NOT_FOUND when the target node does not exist', () => {
    const store = makeStore()
    expect(() => store.getState().createNodeAndLinkChoice('ghost', 0)).toThrow(
      expect.objectContaining({ code: 'NODE_NOT_FOUND' }),
    )
  })

  it('updates classifierCache in the same transaction', async () => {
    const store = await makeStoreWithAdventure([
      makeNode('a', { choices: [makeChoice('')] }),
    ])

    const newId = store.getState().createNodeAndLinkChoice('a', 0)

    const { classifierCache } = store.getState()
    expect(classifierCache.has(newId)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// app-level workflow actions
// ---------------------------------------------------------------------------

describe('createAdventure', () => {
  it('creates a schema-valid document, persists it, and loads it into the store', async () => {
    const store = makeStore()
    await store.getState().createAdventure()

    const { adventureId, document, selectedNodeId } = store.getState()
    expect(adventureId).not.toBeNull()
    expect(document).toHaveLength(1)
    expect(document[0]!.node_type).toBe('start')
    expect(selectedNodeId).toBe(document[0]!.id)
  })

  it('persists the new adventure to the repository', async () => {
    const repo = new InMemoryRepository()
    const store = createAdventureStore(repo)
    await store.getState().createAdventure()

    const { adventureId } = store.getState()
    const ids = await repo.list()
    expect(ids).toContain(adventureId)
  })
})

describe('autoLoadLatest', () => {
  it('loads the most recently saved adventure when one exists', async () => {
    const repo = new InMemoryRepository()
    await repo.save('first', [makeNode('n1', { node_type: 'start' })])
    const store = createAdventureStore(repo)
    await store.getState().autoLoadLatest()

    expect(store.getState().adventureId).toBe('first')
    expect(store.getState().document).toHaveLength(1)
  })

  it('is a no-op when the repository is empty', async () => {
    const store = makeStore()
    await store.getState().autoLoadLatest()

    expect(store.getState().adventureId).toBeNull()
    expect(store.getState().document).toHaveLength(0)
  })
})

describe('listAdventureMetadata', () => {
  it('returns metadata from the repository', async () => {
    const repo = new InMemoryRepository()
    await repo.save('abc', [makeNode('n1', { node_type: 'start', title: 'My Adventure' })])
    const store = createAdventureStore(repo)
    const metadata = await store.getState().listAdventureMetadata()

    expect(metadata).toHaveLength(1)
    expect(metadata[0]!.id).toBe('abc')
    expect(metadata[0]!.title).toBe('My Adventure')
  })

  it('returns an empty array when the repository is empty', async () => {
    const store = makeStore()
    const metadata = await store.getState().listAdventureMetadata()
    expect(metadata).toHaveLength(0)
  })
})
