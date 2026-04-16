import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'jest-axe'
import { AssetManifest, deriveAssetManifest } from './AssetManifest'
import type { AdventureNode } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// deriveAssetManifest — pure function unit tests
// ---------------------------------------------------------------------------

describe('deriveAssetManifest', () => {
  it('returns an empty array when no audio fields are set', () => {
    expect(deriveAssetManifest([makeNode('n1')])).toEqual([])
  })

  it('returns an empty array when all audio fields are empty strings', () => {
    const doc = [makeNode('n1', { entry_foley: '', music: '', sounds: '' })]
    expect(deriveAssetManifest(doc)).toEqual([])
  })

  it('excludes values equal to "none"', () => {
    const doc = [makeNode('n1', { entry_foley: 'none', music: 'none', sounds: 'none' })]
    expect(deriveAssetManifest(doc)).toEqual([])
  })

  it('includes a non-empty, non-"none" entry_foley value', () => {
    const doc = [makeNode('n1', { entry_foley: 'cave_drip.mp3' })]
    expect(deriveAssetManifest(doc)).toEqual([{ type: 'entry_foley', filename: 'cave_drip.mp3' }])
  })

  it('includes a non-empty, non-"none" music value', () => {
    const doc = [makeNode('n1', { music: 'dungeon_theme.ogg' })]
    expect(deriveAssetManifest(doc)).toEqual([{ type: 'music', filename: 'dungeon_theme.ogg' }])
  })

  it('includes a non-empty, non-"none" sounds value', () => {
    const doc = [makeNode('n1', { sounds: 'wind_ambience.mp3' })]
    expect(deriveAssetManifest(doc)).toEqual([{ type: 'sounds', filename: 'wind_ambience.mp3' }])
  })

  it('deduplicates identical (type, filename) pairs across nodes', () => {
    const doc = [
      makeNode('n1', { music: 'theme.ogg' }),
      makeNode('n2', { music: 'theme.ogg' }),
    ]
    const result = deriveAssetManifest(doc)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'music', filename: 'theme.ogg' })
  })

  it('does not deduplicate the same filename used for different field types', () => {
    const doc = [makeNode('n1', { entry_foley: 'sound.mp3', sounds: 'sound.mp3' })]
    const result = deriveAssetManifest(doc)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ type: 'entry_foley', filename: 'sound.mp3' })
    expect(result).toContainEqual({ type: 'sounds', filename: 'sound.mp3' })
  })

  it('preserves document order — first occurrence wins for duplicates', () => {
    const doc = [
      makeNode('n1', { music: 'first.ogg' }),
      makeNode('n2', { music: 'second.ogg' }),
      makeNode('n3', { music: 'first.ogg' }),
    ]
    const result = deriveAssetManifest(doc)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'music', filename: 'first.ogg' })
    expect(result[1]).toEqual({ type: 'music', filename: 'second.ogg' })
  })

  it('collects assets from all three field types in a single node', () => {
    const doc = [makeNode('n1', { entry_foley: 'foley.mp3', music: 'music.ogg', sounds: 'ambient.mp3' })]
    const result = deriveAssetManifest(doc)
    expect(result).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// AssetManifest component — rendering
// ---------------------------------------------------------------------------

describe('AssetManifest — empty state', () => {
  it('renders "No audio assets referenced" when the document has no audio fields', () => {
    render(<AssetManifest document={[makeNode('n1')]} />)
    expect(screen.getByText(/No audio assets referenced/i)).toBeTruthy()
  })

  it('renders "No audio assets referenced" when all audio fields are "none"', () => {
    render(<AssetManifest document={[makeNode('n1', { entry_foley: 'none', music: 'none', sounds: 'none' })]} />)
    expect(screen.getByText(/No audio assets referenced/i)).toBeTruthy()
  })

  it('renders the Asset manifest heading', () => {
    render(<AssetManifest document={[]} />)
    expect(screen.getByRole('heading', { name: 'Asset manifest' })).toBeTruthy()
  })
})

describe('AssetManifest — populated manifest', () => {
  it('renders a list item for each unique asset', () => {
    const doc = [
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg' }),
      makeNode('n2', { sounds: 'wind.mp3' }),
    ]
    const { container } = render(<AssetManifest document={doc} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(3)
  })

  it('displays the filename for each asset', () => {
    const doc = [makeNode('n1', { music: 'epic_theme.ogg' })]
    render(<AssetManifest document={doc} />)
    expect(screen.getByText('epic_theme.ogg')).toBeTruthy()
  })

  it('displays "Entry foley" label for entry_foley assets', () => {
    const doc = [makeNode('n1', { entry_foley: 'door_creak.mp3' })]
    render(<AssetManifest document={doc} />)
    expect(screen.getByText('Entry foley')).toBeTruthy()
  })

  it('displays "Music" label for music assets', () => {
    const doc = [makeNode('n1', { music: 'battle.ogg' })]
    render(<AssetManifest document={doc} />)
    expect(screen.getByText('Music')).toBeTruthy()
  })

  it('displays "Ambient sounds" label for sounds assets', () => {
    const doc = [makeNode('n1', { sounds: 'rain.mp3' })]
    render(<AssetManifest document={doc} />)
    expect(screen.getByText('Ambient sounds')).toBeTruthy()
  })

  it('deduplicates assets — same music file across two nodes yields one list item', () => {
    const doc = [
      makeNode('n1', { music: 'shared.ogg' }),
      makeNode('n2', { music: 'shared.ogg' }),
    ]
    const { container } = render(<AssetManifest document={doc} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// AssetManifest — accessibility
// ---------------------------------------------------------------------------

describe('AssetManifest — accessibility', () => {
  it('has no axe violations in the empty state', async () => {
    const { container } = render(<AssetManifest document={[]} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('has no axe violations with assets listed', async () => {
    const doc = [
      makeNode('n1', { entry_foley: 'cave.mp3', music: 'theme.ogg', sounds: 'wind.mp3' }),
    ]
    const { container } = render(<AssetManifest document={doc} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('exposes the panel as a landmark region', () => {
    render(<AssetManifest document={[]} />)
    expect(screen.getByRole('region', { name: 'Asset manifest' })).toBeTruthy()
  })
})
