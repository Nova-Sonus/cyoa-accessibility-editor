import { describe, it, expect } from 'vitest'
import { InMemoryRepository } from './InMemoryRepository'
import { RepositoryValidationError } from './errors'
import { defineContractSuite } from './contract'
import { validateAdventure } from '../validation/validator'
import type { Adventure } from '../types/adventure'
import CavesOfBane from '../../fixtures/Caves_Of_Bane.json'
import AStrangeDayAtTheZoo from '../../fixtures/a_strange_day_at_the_zoo.json'
import * as repositoryIndex from './index'

// ----------------------------------------------------------------- contract
defineContractSuite('InMemoryRepository', () => new InMemoryRepository())

// ---------------------------------------------------------- fixture round-trips
describe('InMemoryRepository — fixture round-trips', () => {
  it('round-trips Caves_Of_Bane.json preserving every byte of data', async () => {
    const repo = new InMemoryRepository()
    // Caves_Of_Bane contains a known typo in choiceResponseConstaint (OPS-517
    // data-quality note) so we cast through unknown rather than validate.
    await repo.save('caves-of-bane', CavesOfBane as unknown as Adventure)
    const loaded = await repo.load('caves-of-bane')
    expect(loaded).toEqual(CavesOfBane)
  })

  it('round-trips a_strange_day_at_the_zoo.json without schema violation', async () => {
    const repo = new InMemoryRepository()
    await repo.save('zoo', AStrangeDayAtTheZoo as unknown as Adventure)
    const loaded = await repo.load('zoo')
    expect(validateAdventure(loaded)).toBe(true)
    expect(loaded).toEqual(AStrangeDayAtTheZoo)
  })
})

// ---------------------------------------------------------------- validation
describe('InMemoryRepository — save validation (LSP)', () => {
  it('throws RepositoryValidationError when the document fails schema validation', async () => {
    const repo = new InMemoryRepository()
    const invalid = [{ id: 'x' }] as unknown as Adventure
    await expect(repo.save('x', invalid)).rejects.toBeInstanceOf(RepositoryValidationError)
  })

  it('populates validationErrors on the thrown error', async () => {
    const repo = new InMemoryRepository()
    const invalid = [{ id: 'x' }] as unknown as Adventure
    await expect(repo.save('x', invalid)).rejects.toSatisfy(
      (e: unknown) => e instanceof RepositoryValidationError && e.validationErrors.length > 0,
    )
  })
})

// ----------------------------------------------------------- boundary
describe('Repository public API boundary', () => {
  it('does not export InMemoryRepository from the public barrel', () => {
    // The barrel (index.ts) uses a type-only export so the concrete class is
    // unreachable to application-layer importers at both compile time and runtime.
    expect('InMemoryRepository' in repositoryIndex).toBe(false)
  })
})
