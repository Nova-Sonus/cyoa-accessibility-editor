import { createContext, useContext, type ReactNode } from 'react'
import { useStore } from 'zustand'
import type { AdventureStore, AdventureStoreState } from './adventureStore'

const StoreContext = createContext<AdventureStore | null>(null)

export interface AdventureStoreProviderProps {
  store: AdventureStore
  children: ReactNode
}

/**
 * Distributes an `AdventureStore` (vanilla Zustand) through React context.
 *
 * Create the store at the composition root, inject the desired
 * `AdventureRepository`, and wrap the component tree here.  Components then
 * call `useAdventureStore` to subscribe to slices of state.
 */
export function AdventureStoreProvider({ store, children }: AdventureStoreProviderProps) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

/**
 * Subscribe to a slice of the adventure store.
 *
 * @example
 *   const document = useAdventureStore((s) => s.document)
 *
 * @throws if called outside `AdventureStoreProvider`.
 */
export function useAdventureStore<T>(selector: (state: AdventureStoreState) => T): T {
  const store = useContext(StoreContext)
  if (store === null) {
    throw new Error('useAdventureStore must be used within AdventureStoreProvider')
  }
  return useStore(store, selector)
}
