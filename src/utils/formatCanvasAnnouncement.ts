export interface FormatCanvasAnnouncementParams {
  title: string
  nodeType: string
  choiceCount: number
  isCheckpoint: boolean
  /** Title of the node the user arrived from, if known. */
  previousTitle?: string
  /** 1-based index of the choice taken from the previous node. */
  choiceIndex?: number
  /** Total choices on the previous node. */
  totalChoices?: number
}

/**
 * Builds the ARIA announcement string for a canvas node selection.
 *
 * Format: "{title} — {node type} node — {n} choices[  — checkpoint]
 *          [ — arrived from {previousTitle}, choice {index} of {total}]"
 */
export function formatCanvasAnnouncement(params: FormatCanvasAnnouncementParams): string {
  const { title, nodeType, choiceCount, isCheckpoint, previousTitle, choiceIndex, totalChoices } =
    params

  const typeLabel = nodeType.replace(/_/g, ' ')
  const choiceLabel = choiceCount === 1 ? '1 choice' : `${choiceCount} choices`

  const parts: string[] = [`${title} \u2014 ${typeLabel} node \u2014 ${choiceLabel}`]

  if (isCheckpoint) parts.push('checkpoint')

  if (
    previousTitle !== undefined &&
    choiceIndex !== undefined &&
    totalChoices !== undefined
  ) {
    parts.push(`arrived from ${previousTitle}, choice ${choiceIndex} of ${totalChoices}`)
  }

  return parts.join(' \u2014 ')
}
