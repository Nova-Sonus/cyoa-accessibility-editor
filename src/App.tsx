import { useRef, useState, useCallback, useEffect } from 'react'
import { createAdventureStore } from './store'
import { AdventureStoreProvider } from './store/StoreContext'
import { LocalFileRepository } from './repository/LocalFileRepository'
import { OutlineView } from './components/OutlineView/OutlineView'
import { CanvasView } from './components/CanvasView'
import { CompanionPanel } from './components/CompanionPanel/CompanionPanel'
import { AppHeader } from './components/AppHeader/AppHeader'
import { LegendBar } from './components/LegendBar/LegendBar'
import { OpenDialog } from './components/OpenDialog/OpenDialog'
import type { AdventureMetadata } from './types/adventure'
import styles from './App.module.css'

type ActiveView = 'outline' | 'canvas'

export default function App() {
  const storeRef = useRef(createAdventureStore(new LocalFileRepository()))

  const [activeView, setActiveView] = useState<ActiveView>('canvas')
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  const [openDialogVisible, setOpenDialogVisible] = useState(false)
  const [openDialogMetadata, setOpenDialogMetadata] = useState<AdventureMetadata[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    void storeRef.current.getState().autoLoadLatest()
  }, [])

  const handleNewAdventure = useCallback(async () => {
    await storeRef.current.getState().createAdventure()
    setActiveView('canvas')
  }, [])

  const handleOpenDialog = useCallback(async () => {
    const metadata = await storeRef.current.getState().listAdventureMetadata()
    setOpenDialogMetadata(metadata)
    setOpenDialogVisible(true)
  }, [])

  const handleSelectAdventure = useCallback(async (id: string) => {
    setOpenDialogVisible(false)
    await storeRef.current.getState().loadAdventure(id)
    setActiveView('canvas')
  }, [])

  const handleSave = useCallback(async () => {
    setSaveError(null)
    setIsSaving(true)
    try {
      await storeRef.current.getState().saveAdventure()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setIsSaving(false)
    }
  }, [])

  // Canvas node activate: select in store (updates CompanionPanel).
  // pendingFocusId is retained for outline-mode focus via focusNodeId prop.
  const handleCanvasNodeActivate = useCallback((nodeId: string) => {
    storeRef.current.getState().setSelectedNodeId(nodeId)
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
          onOpen={() => { void handleOpenDialog() }}
          onSave={() => { void handleSave() }}
          isSaving={isSaving}
          saveError={saveError}
        />
        <LegendBar />

        <main className={styles.main}>
          {/* Canvas mode: CompanionPanel (left) + CanvasView (right) — always mounted */}
          <div
            role="tabpanel"
            id="panel-canvas"
            aria-labelledby="tab-canvas"
            hidden={activeView !== 'canvas'}
            className={styles.canvasPanel}
          >
            <CompanionPanel />
            <CanvasView onNodeActivate={handleCanvasNodeActivate} />
          </div>

          {/* Outline mode: full-width — always mounted */}
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
        </main>
      </div>

      <OpenDialog
        isOpen={openDialogVisible}
        metadata={openDialogMetadata}
        onSelect={(id) => { void handleSelectAdventure(id) }}
        onClose={() => setOpenDialogVisible(false)}
      />
    </AdventureStoreProvider>
  )
}
