import { describe, it, expect } from 'vitest'
import type { Adventure } from '../types/adventure'
import { validateAdventure, getValidationErrors } from './validator'

// A minimal schema-valid adventure used as the canonical "valid document"
// fixture for validator tests. Caves_Of_Bane.json cannot be used here because
// it contains 311 choices where the field is misspelled as
// "choiceResponseConstaint" (missing the 'r') — see OPS-517 data-quality note.
const minimalValidAdventure: Adventure = [
  {
    id: 'start-1',
    title: 'The Beginning',
    node_type: 'start',
    narrativeText: 'Your adventure begins here.',
    choices: [
      {
        choiceText: 'Go north',
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

describe('validateAdventure', () => {
  it('accepts a minimal schema-valid adventure', () => {
    expect(validateAdventure(minimalValidAdventure)).toBe(true)
  })

  it('accepts optional fields alongside required fields', () => {
    const withOptionals: Adventure = [
      {
        id: 'n1',
        title: 'Checkpoint Node',
        node_type: 'scene_start',
        narrativeText: 'You enter the scene.',
        checkpoint: true,
        entry_foley: 'door_creak',
        music: 'tense_theme',
        sounds: 'wind',
        activities: ['search_room'],
        choices: [
          {
            choiceText: 'Leave',
            choiceResponseConstraint: 'none',
            nextNode: 'n2',
          },
        ],
      },
      {
        id: 'n2',
        title: 'Success',
        node_type: 'adventure_success',
        narrativeText: 'You have won.',
        choices: [],
      },
    ]
    expect(validateAdventure(withOptionals)).toBe(true)
  })

  it('rejects a non-array document', () => {
    expect(validateAdventure({ not: 'an array' })).toBe(false)
  })

  it('rejects a node missing required fields', () => {
    expect(validateAdventure([{ id: 'n1', title: 'Incomplete' }])).toBe(false)
  })

  it('rejects a terminal "end" node with a non-empty choices array', () => {
    const invalid: Adventure = [
      {
        id: 'n1',
        title: 'The End',
        node_type: 'end',
        narrativeText: 'You have reached the end.',
        choices: [
          {
            choiceText: 'Continue',
            choiceResponseConstraint: 'none',
            nextNode: 'n2',
          },
        ],
      },
    ]
    expect(validateAdventure(invalid)).toBe(false)
  })

  it('rejects a terminal "adventure_success" node with a non-empty choices array', () => {
    const invalid: Adventure = [
      {
        id: 'n1',
        title: 'Victory',
        node_type: 'adventure_success',
        narrativeText: 'You have won.',
        choices: [
          {
            choiceText: 'Play again',
            choiceResponseConstraint: 'none',
            nextNode: 'n2',
          },
        ],
      },
    ]
    expect(validateAdventure(invalid)).toBe(false)
  })

  it('accepts a terminal "end" node with an empty choices array', () => {
    const valid: Adventure = [
      {
        id: 'n1',
        title: 'The End',
        node_type: 'end',
        narrativeText: 'You have reached the end.',
        choices: [],
      },
    ]
    expect(validateAdventure(valid)).toBe(true)
  })

  it('accepts a terminal "adventure_success" node with an empty choices array', () => {
    const valid: Adventure = [
      {
        id: 'n1',
        title: 'Victory',
        node_type: 'adventure_success',
        narrativeText: 'You have won.',
        choices: [],
      },
    ]
    expect(validateAdventure(valid)).toBe(true)
  })
})

describe('getValidationErrors', () => {
  it('returns an empty array for a valid document', () => {
    expect(getValidationErrors(minimalValidAdventure)).toEqual([])
  })

  it('returns error messages for a document missing required fields', () => {
    const errors = getValidationErrors([{ id: 'n1' }])
    expect(errors.length).toBeGreaterThan(0)
  })

  it('returns an error for a terminal node with choices', () => {
    const errors = getValidationErrors([
      {
        id: 'n1',
        title: 'The End',
        node_type: 'end',
        narrativeText: 'Done.',
        choices: [
          {
            choiceText: 'Go',
            choiceResponseConstraint: 'none',
            nextNode: 'n2',
          },
        ],
      },
    ])
    expect(errors.length).toBeGreaterThan(0)
  })
})
