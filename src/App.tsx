import { useRef } from 'react'
import { createAdventureStore } from './store'
import { AdventureStoreProvider } from './store/StoreContext'
import { InMemoryRepository } from './repository/InMemoryRepository'
import { OutlineView } from './components/OutlineView/OutlineView'

export default function App() {
  // Composition root — store is created once and distributed via context.
  // Replace InMemoryRepository with LocalFileRepository or IndexedDBRepository
  // when those implementations land (OPS-533).
  const storeRef = useRef(createAdventureStore(new InMemoryRepository()))

  return (
    <AdventureStoreProvider store={storeRef.current}>
      <main>
        <h1>Nova Sonus — CYOA Editor</h1>
        <OutlineView />
      </main>
    </AdventureStoreProvider>
  )
}
