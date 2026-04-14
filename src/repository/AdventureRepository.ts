import type { Adventure } from '../types/adventure'

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
   */
  save(id: string, adventure: Adventure): Promise<void>

  /**
   * Removes the adventure stored under `id`.
   * @throws {Error} if no adventure exists with that id.
   */
  delete(id: string): Promise<void>
}
