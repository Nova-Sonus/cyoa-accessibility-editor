import { describe, it, expect } from 'vitest'
import { formatCanvasAnnouncement } from './formatCanvasAnnouncement'

describe('formatCanvasAnnouncement', () => {
  it('formats a basic node with no previous node', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'The Iron Gate',
        nodeType: 'decision',
        choiceCount: 3,
        isCheckpoint: false,
      }),
    ).toBe('The Iron Gate \u2014 decision node \u2014 3 choices')
  })

  it('includes checkpoint clause when isCheckpoint is true', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'The Iron Gate',
        nodeType: 'decision',
        choiceCount: 3,
        isCheckpoint: true,
      }),
    ).toBe('The Iron Gate \u2014 decision node \u2014 3 choices \u2014 checkpoint')
  })

  it('includes arrived-from clause when previous node context is provided', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'The Iron Gate',
        nodeType: 'decision',
        choiceCount: 3,
        isCheckpoint: true,
        previousTitle: 'A Misty Morning Approach',
        choiceIndex: 1,
        totalChoices: 2,
      }),
    ).toBe(
      'The Iron Gate \u2014 decision node \u2014 3 choices \u2014 checkpoint \u2014 arrived from A Misty Morning Approach, choice 1 of 2',
    )
  })

  it('includes arrived-from with multiple choices and no checkpoint', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'Dark Forest',
        nodeType: 'narrative',
        choiceCount: 1,
        isCheckpoint: false,
        previousTitle: 'The Crossroads',
        choiceIndex: 2,
        totalChoices: 3,
      }),
    ).toBe(
      'Dark Forest \u2014 narrative node \u2014 1 choice \u2014 arrived from The Crossroads, choice 2 of 3',
    )
  })

  it('uses singular "choice" when choiceCount is 1', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'Narrow Path',
        nodeType: 'narrative',
        choiceCount: 1,
        isCheckpoint: false,
      }),
    ).toBe('Narrow Path \u2014 narrative node \u2014 1 choice')
  })

  it('formats terminal node with 0 choices', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'The End',
        nodeType: 'end',
        choiceCount: 0,
        isCheckpoint: false,
      }),
    ).toBe('The End \u2014 end node \u2014 0 choices')
  })

  it('replaces underscores in nodeType with spaces', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'Victory',
        nodeType: 'adventure_success',
        choiceCount: 0,
        isCheckpoint: false,
      }),
    ).toBe('Victory \u2014 adventure success node \u2014 0 choices')
  })

  it('omits arrived-from clause when only some context fields are provided', () => {
    expect(
      formatCanvasAnnouncement({
        title: 'Dark Forest',
        nodeType: 'narrative',
        choiceCount: 2,
        isCheckpoint: false,
        previousTitle: 'Some Node',
        // choiceIndex and totalChoices omitted
      }),
    ).toBe('Dark Forest \u2014 narrative node \u2014 2 choices')
  })
})
