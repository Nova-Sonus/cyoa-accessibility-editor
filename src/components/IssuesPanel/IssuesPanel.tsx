import type { Issue } from './deriveIssues'

export interface IssuesPanelProps {
  issues: Issue[]
  /**
   * Called when the user activates an issue item.
   * The parent is responsible for moving focus to the offending node.
   */
  onActivate: (nodeId: string) => void
}

/**
 * Always-visible issues panel.
 *
 * Design decisions:
 * - Always rendered (never conditionally hidden) so the "no issues" state is
 *   explicit rather than the panel simply disappearing — satisfies OPS-531 AC.
 * - Each issue is a `<button>` so it participates in the tab order and can be
 *   activated with Space/Enter — no custom keyboard handling needed.
 * - The section uses `aria-label="Issues"` so it is surfaced as a landmark
 *   in assistive technology navigation.
 */
export function IssuesPanel({ issues, onActivate }: IssuesPanelProps) {
  return (
    <section aria-label="Issues">
      <h2>Issues</h2>
      {issues.length === 0 ? (
        <p>No issues found.</p>
      ) : (
        <ul>
          {issues.map((issue) => (
            <li key={issue.id}>
              <button type="button" onClick={() => onActivate(issue.nodeId)}>
                <strong>{issue.nodeTitle}</strong>: {issue.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
