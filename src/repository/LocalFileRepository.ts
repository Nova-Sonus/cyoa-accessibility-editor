import { validateAdventure, getValidationErrors } from '../validation/validator'
import type { Adventure, AdventureMetadata } from '../types/adventure'
import type { AdventureRepository } from './AdventureRepository'

// ---------------------------------------------------------------------------
// LocalFileRepository — localStorage-backed persistence
//
// Adventures are stored in the browser's localStorage under a shared namespace.
// This implementation satisfies the AdventureRepository contract and persists
// data across page reloads without requiring a server or user file-picker gesture.
//
// Key scheme:
//   nova-sonus:index          JSON-encoded AdventureMetadata[] of stored adventures
//   nova-sonus:adv:<id>       JSON-encoded Adventure document
// ---------------------------------------------------------------------------

const NS = 'nova-sonus'

function indexKey(): string {
  return `${NS}:index`
}

function docKey(id: string): string {
  return `${NS}:adv:${id}`
}

// ---------------------------------------------------------------------------
// RepositoryValidationError
// ---------------------------------------------------------------------------

/**
 * Thrown by LocalFileRepository.save() when the adventure document fails Ajv
 * schema validation.  The caller can inspect `validationErrors` for a list of
 * human-readable Ajv messages.
 */
export class RepositoryValidationError extends Error {
  readonly validationErrors: string[]

  constructor(message: string, errors: string[]) {
    super(message)
    this.name = 'RepositoryValidationError'
    this.validationErrors = errors
  }
}

// ---------------------------------------------------------------------------
// LocalFileRepository
// ---------------------------------------------------------------------------

/**
 * Concrete AdventureRepository implementation that persists to the browser's
 * localStorage.  All reads and writes produce deep-cloned copies so that
 * external mutation of a caller's reference can never corrupt the stored
 * document.
 *
 * `save()` validates the document against CYOA_Schema.json before writing.
 * A schema-invalid document throws `RepositoryValidationError` so the error
 * can be surfaced to the author in the issues panel.
 *
 * Constructed at the composition root (App.tsx) and never imported by
 * application-layer code — only the AdventureRepository interface is used
 * throughout the app.
 */
export class LocalFileRepository implements AdventureRepository {
  async listMetadata(): Promise<AdventureMetadata[]> {
    const raw = localStorage.getItem(indexKey())
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    // Migrate legacy string[] index (stored pre-OPS-542) — treat as unknown titles.
    if (typeof parsed[0] === 'string') {
      return (parsed as string[]).map((id) => ({
        id,
        title: 'Unknown adventure',
        savedAt: new Date(0).toISOString(),
      }))
    }
    return (parsed as AdventureMetadata[]).slice().sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    )
  }

  async list(): Promise<string[]> {
    const metadata = await this.listMetadata()
    return metadata.map((m) => m.id)
  }

  async load(id: string): Promise<Adventure> {
    const raw = localStorage.getItem(docKey(id))
    if (raw === null) {
      throw new Error(`Adventure not found: "${id}"`)
    }
    return JSON.parse(raw) as Adventure
  }

  async save(id: string, adventure: Adventure): Promise<void> {
    if (!validateAdventure(adventure)) {
      const errors = getValidationErrors(adventure)
      throw new RepositoryValidationError(
        `Cannot save: adventure document is not schema-valid. ${errors.join(' ')}`,
        errors,
      )
    }

    localStorage.setItem(docKey(id), JSON.stringify(adventure))

    const title = adventure[0]?.title ?? 'Untitled'
    const savedAt = new Date().toISOString()
    const current = await this.listMetadata()
    const existingIndex = current.findIndex((m) => m.id === id)
    const updated: AdventureMetadata[] =
      existingIndex >= 0
        ? current.map((m) => (m.id === id ? { id, title, savedAt } : m))
        : [...current, { id, title, savedAt }]
    localStorage.setItem(indexKey(), JSON.stringify(updated))
  }

  async delete(id: string): Promise<void> {
    const current = await this.listMetadata()
    if (!current.some((m) => m.id === id)) {
      throw new Error(`Adventure not found: "${id}"`)
    }
    localStorage.removeItem(docKey(id))
    localStorage.setItem(indexKey(), JSON.stringify(current.filter((m) => m.id !== id)))
  }
}
