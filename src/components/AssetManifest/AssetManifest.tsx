import type { Adventure } from '../../types/adventure'

/** A single unique audio asset referenced in the adventure document. */
export interface AssetManifestEntry {
  /** Which node field the asset comes from. */
  type: 'entry_foley' | 'music' | 'sounds'
  /** The filename or path as authored. */
  filename: string
}

const FIELD_LABELS: Record<AssetManifestEntry['type'], string> = {
  entry_foley: 'Entry foley',
  music: 'Music',
  sounds: 'Ambient sounds',
}

const AUDIO_FIELDS = ['entry_foley', 'music', 'sounds'] as const

/**
 * Derives the set of unique audio assets referenced across the adventure.
 *
 * Values of `'none'` and empty strings are excluded — they indicate the field
 * has been explicitly cleared or left blank.  Each unique (type, filename) pair
 * appears exactly once, in document order (first occurrence wins).
 */
export function deriveAssetManifest(document: Adventure): AssetManifestEntry[] {
  const seen = new Set<string>()
  const entries: AssetManifestEntry[] = []

  for (const node of document) {
    for (const field of AUDIO_FIELDS) {
      const value = node[field]
      if (!value || value === 'none') continue
      const key = `${field}:${value}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({ type: field, filename: value })
    }
  }

  return entries
}

export interface AssetManifestProps {
  document: Adventure
}

/**
 * Asset manifest panel — lists every unique audio file referenced in the
 * adventure, grouped by field type (entry foley, music, ambient sounds).
 *
 * Design decisions:
 * - Always rendered (never conditionally hidden) so authors have a persistent
 *   view of required audio assets even before any are referenced.
 * - Section uses `aria-label="Asset manifest"` to surface it as a landmark.
 * - Values of `'none'` and empty strings are excluded from the manifest.
 */
export function AssetManifest({ document }: AssetManifestProps) {
  const entries = deriveAssetManifest(document)

  return (
    <section aria-label="Asset manifest">
      <h2>Asset manifest</h2>
      {entries.length === 0 ? (
        <p>No audio assets referenced.</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={`${entry.type}:${entry.filename}`}>
              <span>{FIELD_LABELS[entry.type]}</span>:{' '}
              <code>{entry.filename}</code>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
