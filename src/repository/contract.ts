import { describe, it, expect, beforeEach } from 'vitest'
import type { AdventureRepository } from './AdventureRepository'
import type { Adventure } from '../types/adventure'

const minimalAdventure: Adventure = [
  {
    id: 'start-1',
    title: 'The Beginning',
    node_type: 'start',
    narrativeText: 'Your journey begins here.',
    choices: [
      {
        choiceText: 'Continue',
        choiceResponseConstraint: 'none',
        nextNode: 'end-1',
      },
    ],
  },
  {
    id: 'end-1',
    title: 'The End',
    node_type: 'end',
    narrativeText: 'Your adventure is over.',
    choices: [],
  },
]

/**
 * Shared contract test suite for AdventureRepository implementations.
 *
 * Call this function once per concrete implementation, passing a factory that
 * returns a fresh, empty repository for each test. Every implementation that
 * satisfies the interface must pass every assertion here.
 *
 * @example
 * defineContractSuite('InMemoryRepository', () => new InMemoryRepository())
 */
export function defineContractSuite(
  name: string,
  factory: () => AdventureRepository,
): void {
  describe(`AdventureRepository contract [${name}]`, () => {
    let repo: AdventureRepository

    beforeEach(() => {
      repo = factory()
    })

    // ------------------------------------------------------------------ list
    describe('list', () => {
      it('returns an empty array when no adventures are stored', async () => {
        expect(await repo.list()).toEqual([])
      })

      it('returns the id of a single saved adventure', async () => {
        await repo.save('alpha', minimalAdventure)
        expect(await repo.list()).toContain('alpha')
      })

      it('returns all ids when multiple adventures are stored', async () => {
        await repo.save('alpha', minimalAdventure)
        await repo.save('beta', minimalAdventure)
        expect((await repo.list()).sort()).toEqual(['alpha', 'beta'])
      })

      it('does not include deleted ids', async () => {
        await repo.save('alpha', minimalAdventure)
        await repo.save('beta', minimalAdventure)
        await repo.delete('alpha')
        expect(await repo.list()).not.toContain('alpha')
        expect(await repo.list()).toContain('beta')
      })
    })

    // --------------------------------------------------------------- save + load
    describe('save and load', () => {
      it('round-trips an adventure without data loss', async () => {
        await repo.save('rt', minimalAdventure)
        expect(await repo.load('rt')).toEqual(minimalAdventure)
      })

      it('overwrites an existing adventure when saved under the same id', async () => {
        await repo.save('ow', minimalAdventure)
        const updated: Adventure = [
          { ...minimalAdventure[0], title: 'Revised Start' },
          minimalAdventure[1],
        ]
        await repo.save('ow', updated)
        const loaded = await repo.load('ow')
        expect(loaded[0].title).toBe('Revised Start')
      })

      it('isolates stored data from mutation of the saved reference', async () => {
        const mutable: Adventure = JSON.parse(JSON.stringify(minimalAdventure))
        await repo.save('iso-save', mutable)
        mutable[0].title = 'MUTATED AFTER SAVE'
        const loaded = await repo.load('iso-save')
        expect(loaded[0].title).toBe('The Beginning')
      })

      it('isolates loaded data from mutation affecting the store', async () => {
        await repo.save('iso-load', minimalAdventure)
        const first = await repo.load('iso-load')
        first[0].title = 'MUTATED AFTER LOAD'
        const second = await repo.load('iso-load')
        expect(second[0].title).toBe('The Beginning')
      })

      it('throws when loading a non-existent id', async () => {
        await expect(repo.load('ghost')).rejects.toThrow()
      })

      it('two different ids store independent documents', async () => {
        const a: Adventure = [{ ...minimalAdventure[0], title: 'Adventure A' }, minimalAdventure[1]]
        const b: Adventure = [{ ...minimalAdventure[0], title: 'Adventure B' }, minimalAdventure[1]]
        await repo.save('a', a)
        await repo.save('b', b)
        expect((await repo.load('a'))[0].title).toBe('Adventure A')
        expect((await repo.load('b'))[0].title).toBe('Adventure B')
      })
    })

    // -------------------------------------------------------------- delete
    describe('delete', () => {
      it('removes the adventure so it is no longer retrievable', async () => {
        await repo.save('del', minimalAdventure)
        await repo.delete('del')
        await expect(repo.load('del')).rejects.toThrow()
      })

      it('throws when deleting a non-existent id', async () => {
        await expect(repo.delete('ghost')).rejects.toThrow()
      })

      it('does not affect other stored adventures', async () => {
        await repo.save('keep', minimalAdventure)
        await repo.save('remove', minimalAdventure)
        await repo.delete('remove')
        await expect(repo.load('keep')).resolves.toEqual(minimalAdventure)
      })
    })
  })
}
