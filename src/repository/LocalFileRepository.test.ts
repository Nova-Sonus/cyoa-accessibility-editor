import { describe, it, expect, beforeEach } from 'vitest'
import { LocalFileRepository, RepositoryValidationError } from './LocalFileRepository'
import { defineContractSuite } from './contract'
import type { Adventure } from '../types/adventure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clear all nova-sonus localStorage keys between tests to ensure isolation. */
function clearRepo(): void {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('nova-sonus:'))
    .forEach((k) => localStorage.removeItem(k))
}

// ---------------------------------------------------------------------------
// Contract suite
// ---------------------------------------------------------------------------

describe('LocalFileRepository', () => {
  // Flush stored data before each test so contract tests cannot bleed state
  // into one another.  The outer beforeEach runs before the nested beforeEach
  // that defineContractSuite registers, giving us a clean slate for every test.
  beforeEach(() => {
    clearRepo()
  })

  defineContractSuite('LocalFileRepository', () => new LocalFileRepository())

  // -------------------------------------------------------------------------
  // Schema validation
  // -------------------------------------------------------------------------

  describe('save — schema validation', () => {
    let repo: LocalFileRepository

    beforeEach(() => {
      clearRepo()
      repo = new LocalFileRepository()
    })

    it('rejects a document that is not an array', async () => {
      await expect(
        repo.save('bad', { not: 'an array' } as unknown as Adventure),
      ).rejects.toThrow(RepositoryValidationError)
    })

    it('rejects a node missing required fields', async () => {
      await expect(
        repo.save('bad', [{ id: 'x' }] as unknown as Adventure),
      ).rejects.toThrow(RepositoryValidationError)
    })

    it('populates validationErrors with Ajv messages', async () => {
      let caught: unknown
      try {
        await repo.save('bad', [{ id: 'x' }] as unknown as Adventure)
      } catch (err) {
        caught = err
      }
      expect(caught).toBeInstanceOf(RepositoryValidationError)
      expect((caught as RepositoryValidationError).validationErrors.length).toBeGreaterThan(0)
    })

    it('accepts and persists a schema-valid adventure', async () => {
      const valid: Adventure = [
        {
          id: 'start',
          title: 'Start',
          node_type: 'start',
          narrativeText: 'Begin.',
          choices: [{ choiceText: 'Go', choiceResponseConstraint: 'none', nextNode: 'end' }],
        },
        {
          id: 'end',
          title: 'End',
          node_type: 'end',
          narrativeText: 'Done.',
          choices: [],
        },
      ]
      await expect(repo.save('valid', valid)).resolves.toBeUndefined()
      expect(await repo.list()).toContain('valid')
    })

    it('rejects a terminal node with non-empty choices', async () => {
      const invalid: Adventure = [
        {
          id: 'end',
          title: 'End',
          node_type: 'end',
          narrativeText: 'Done.',
          // schema if/then forbids choices on terminal nodes
          choices: [{ choiceText: 'Oops', choiceResponseConstraint: '', nextNode: '' }],
        },
      ]
      await expect(repo.save('bad', invalid)).rejects.toThrow(RepositoryValidationError)
    })
  })

  // -------------------------------------------------------------------------
  // Persistence — data survives a fresh repository instance
  // -------------------------------------------------------------------------

  describe('cross-instance persistence', () => {
    it('data saved by one instance is readable by a second instance sharing the same storage', async () => {
      const repoA = new LocalFileRepository()
      const adventure: Adventure = [
        {
          id: 'start',
          title: 'Shared',
          node_type: 'start',
          narrativeText: '',
          choices: [],
        },
      ]
      await repoA.save('shared', adventure)

      const repoB = new LocalFileRepository()
      const loaded = await repoB.load('shared')
      expect(loaded[0]!.title).toBe('Shared')
    })
  })
})
