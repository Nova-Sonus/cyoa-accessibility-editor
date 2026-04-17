import { useRef, useState, useCallback, useEffect } from 'react'
import { createAdventureStore } from './store'
import { AdventureStoreProvider } from './store/StoreContext'
import { LocalFileRepository } from './repository/LocalFileRepository'
import { OutlineView } from './components/OutlineView/OutlineView'
import { CanvasView } from './components/CanvasView'
import type { Adventure } from './types/adventure'

type ActiveView = 'outline' | 'canvas'

/**
 * Builds a minimal schema-valid adventure for a fresh document.
 * Returns both the adventure array and the first node's id so the caller
 * can move keyboard focus there after loading.
 */
function makeNewAdventure(): { adventure: Adventure; firstNodeId: string } {
  const firstNodeId = crypto.randomUUID()
  return {
    firstNodeId,
    adventure: [
      {
        id: firstNodeId,
        title: 'New Adventure',
        node_type: 'start',
        narrativeText: '',
        choices: [],
      },
    ],
  }
}

export default function App() {
  // Composition root — store is created once and distributed via context.
  // LocalFileRepository persists adventures to localStorage so that work
  // survives page reloads (OPS-535).
  const repoRef = useRef(new LocalFileRepository())
  const storeRef = useRef(createAdventureStore(repoRef.current))

  const [activeView, setActiveView] = useState<ActiveView>('outline')

  // When the user activates a node from the canvas view, switch to outline
  // and focus that node's title input.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

  // Auto-load the most recently saved adventure on first mount so that
  // refreshing the page restores the previous session.
  useEffect(() => {
    const repo = repoRef.current
    const store = storeRef.current
    repo
      .list()
      .then((ids) => {
        if (ids.length > 0) {
          return store.getState().loadAdventure(ids[ids.length - 1]!)
        }
      })
      .catch(() => {
        // Silently ignore auto-load failures; the empty-state UI guides the
        // author to create a new adventure.
      })
  }, [])

  const handleNewAdventure = useCallback(async () => {
    const id = crypto.randomUUID()
    const { adventure, firstNodeId } = makeNewAdventure()
    // Save first so the adventure exists in the repository before loading.
    await repoRef.current.save(id, adventure)
    await storeRef.current.getState().loadAdventure(id)
    // Move keyboard focus to the new node's title field so authors can
    // start typing immediately without tabbing through the UI.
    setPendingFocusId(firstNodeId)
  }, [])

  const handleCanvasNodeActivate = useCallback((nodeId: string) => {
    setPendingFocusId(nodeId)
    setActiveView('outline')
  }, [])

  const handleFocusConsumed = useCallback(() => {
    setPendingFocusId(null)
  }, [])

  return (
    <AdventureStoreProvider store={storeRef.current}>
      <main>
        <h1>Nova Sonus — CYOA Editor</h1>

        <nav aria-label="View selection" style={{ marginBottom: '12px' }}>
          <button
            type="button"
            onClick={() => setActiveView('outline')}
            aria-pressed={activeView === 'outline'}
            style={{ marginRight: '8px' }}
          >
            Outline
          </button>
          <button
            type="button"
            onClick={() => setActiveView('canvas')}
            aria-pressed={activeView === 'canvas'}
            style={{ marginRight: '8px' }}
          >
            Canvas
          </button>
          <button
            type="button"
            onClick={() => { void handleNewAdventure() }}
          >
            New adventure
          </button>
        </nav>

        {activeView === 'outline' ? (
          <OutlineView
            focusNodeId={pendingFocusId}
            onFocusConsumed={handleFocusConsumed}
          />
        ) : (
          <CanvasView onNodeActivate={handleCanvasNodeActivate} />
        )}
      </main>
    </AdventureStoreProvider>
  )
}
