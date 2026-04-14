import type { Adventure } from '../types/adventure'
import type { AdventureRepository } from './AdventureRepository'

/**
 * Volatile in-memory implementation of AdventureRepository.
 *
 * Data is held in a private Map and is not persisted across page reloads.
 * All reads and writes produce deep-cloned copies so that external mutation
 * of a caller's reference can never corrupt the stored document, and vice
 * versa.
 *
 * Intended for tests and as a lightweight runtime fallback only.
 * Production code must obtain repository instances via the composition root
 * and type them as AdventureRepository — never as InMemoryRepository.
 */
export class InMemoryRepository implements AdventureRepository {
  private readonly store = new Map<string, Adventure>()

  async list(): Promise<string[]> {
    return Array.from(this.store.keys())
  }

  async load(id: string): Promise<Adventure> {
    const adventure = this.store.get(id)
    if (adventure === undefined) {
      throw new Error(`Adventure not found: "${id}"`)
    }
    return JSON.parse(JSON.stringify(adventure)) as Adventure
  }

  async save(id: string, adventure: Adventure): Promise<void> {
    this.store.set(id, JSON.parse(JSON.stringify(adventure)) as Adventure)
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) {
      throw new Error(`Adventure not found: "${id}"`)
    }
    this.store.delete(id)
  }
}
