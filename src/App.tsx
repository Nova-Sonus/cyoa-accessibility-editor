import { useRef, useState, useCallback, useEffect } from 'react'
import { createAdventureStore } from './store'
import { AdventureStoreProvider } from './store/StoreContext'
import { LocalFileRepository } from './repository/LocalFileRepository'
import { OutlineView } from './components/OutlineView/OutlineView'
import { CanvasView } from './components/CanvasView'
import { AppHeader } from './components/AppHeader/AppHeader'
import { LegendBar } from './components/LegendBar/LegendBar'
import type { Adventure } from './types/adventure'
import styles from './App.module.css'

type ActiveView = 'outline' | 'canvas'

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
  const repoRef = useRef(new LocalFileRepository())
  const storeRef = useRef(createAdventureStore(repoRef.current))

  const [activeView, setActiveView] = useState<ActiveView>('outline')
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)

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
        // Silently ignore auto-load failures.
      })
  }, [])

  const handleNewAdventure = useCallback(async () => {
    const id = crypto.randomUUID()
    const { adventure, firstNodeId } = makeNewAdventure()
    await repoRef.current.save(id, adventure)
    await storeRef.current.getState().loadAdventure(id)
    setActiveView('outline')
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
      <div className={styles.shell}>
        <AppHeader
          activeView={activeView}
          onViewChange={setActiveView}
          onNewAdventure={() => { void handleNewAdventure() }}
        />
        <LegendBar />

        <div
          role="tabpanel"
          id="panel-outline"
          aria-labelledby="tab-outline"
          hidden={activeView !== 'outline'}
          className={styles.panel}
        >
          <OutlineView
            focusNodeId={pendingFocusId}
            onFocusConsumed={handleFocusConsumed}
          />
        </div>

        <div
          role="tabpanel"
          id="panel-canvas"
          aria-labelledby="tab-canvas"
          hidden={activeView !== 'canvas'}
          className={styles.panel}
        >
          <CanvasView onNodeActivate={handleCanvasNodeActivate} />
        </div>
      </div>
    </AdventureStoreProvider>
  )
}
