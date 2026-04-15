/**
 * Public API for the adventure store.
 *
 * Import `createAdventureStore` at the composition root, inject the desired
 * `AdventureRepository` implementation, and distribute the resulting store via
 * React context. Application components import only the types and the context
 * hook — never the concrete repository or the store factory.
 */
export { createAdventureStore } from './adventureStore'
export type { AdventureState, AdventureActions, AdventureStoreState, AdventureStore } from './adventureStore'
export { StoreActionError } from './errors'
export type { StoreErrorCode } from './errors'
export { AdventureStoreProvider, useAdventureStore } from './StoreContext'
export type { AdventureStoreProviderProps } from './StoreContext'
