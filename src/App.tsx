import { useRef, useState, useCallback } from 'react'
import { createAdventureStore } from './store'
import { AdventureStoreProvider } from './store/StoreContext'
import { InMemoryRepository } from './repository/InMemoryRepository'
import { OutlineView } from './components/OutlineView/OutlineView'
import { CanvasView } from './components/CanvasView'

type ActiveView = 'outline' | 'canvas'

export default function App() {
  // Composition root — store is created once and distributed via context.
  // Replace InMemoryRepository with LocalFileRepository or IndexedDBRepository
  // when those implementations land (OPS-533).
  const storeRef = useRef(createAdventureStore(new InMemoryRepository()))

  const [activeView, setActiveView] = useState<ActiveView>('outline')

  // When the user activates a node from the canvas view, switch to outline
  // and focus that node's title input.
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

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
          >
            Canvas
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
