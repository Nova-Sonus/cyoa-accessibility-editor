import type { Adventure, AdventureMetadata } from '../types/adventure'

/**
 * Persistence contract for adventure documents.
 *
 * Concrete implementations (InMemoryRepository, LocalFileRepository,
 * IndexedDBRepository, SupabaseRepository) are injected at the composition
 * root. Application-layer code imports only this interface — never a concrete
 * class — so the storage backend can be swapped without touching the UI.
 */
export interface AdventureRepository {
  /**
   * Returns the document IDs of all stored adventures.
   * Returns an empty array when the store is empty.
   */
  list(): Promise<string[]>

  /**
   * Returns the adventure stored under `id`.
   * @throws {Error} if no adventure exists with that id.
   */
  load(id: string): Promise<Adventure>

  /**
   * Persists `adventure` under `id`, overwriting any existing document.
   * The repository stores an isolated copy; subsequent mutation of the
   * caller's reference does not affect the stored data.
   *
   * `displayTitle`, when provided, is stored as the human-readable adventure
   * name in the metadata index instead of deriving it from the first node's
   * title. Use this when the caller has a more meaningful name (e.g. the
   * original filename of an imported adventure).
   */
  save(id: string, adventure: Adventure, displayTitle?: string): Promise<void>

  /**
   * Removes the adventure stored under `id`.
   * @throws {Error} if no adventure exists with that id.
   */
  delete(id: string): Promise<void>

  /**
   * Returns lightweight metadata for all stored adventures, ordered by
   * most-recently saved first.  Used by the Open dialog to display a human-
   * readable list without loading full documents.
   */
  listMetadata(): Promise<AdventureMetadata[]>
}
