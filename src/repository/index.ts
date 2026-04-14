/**
 * Public API for the repository layer.
 *
 * Only the AdventureRepository interface is exported from this barrel.
 * Concrete implementations (InMemoryRepository, LocalFileRepository, etc.)
 * are intentionally absent so that application-layer code can never depend
 * on a specific storage backend.
 *
 * Concrete classes are constructed at the composition root (e.g. main.tsx)
 * and passed to consumers typed as AdventureRepository.
 */
export type { AdventureRepository } from './AdventureRepository'
