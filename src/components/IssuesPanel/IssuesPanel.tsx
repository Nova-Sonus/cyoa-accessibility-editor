import type { Issue } from './deriveIssues'

export interface IssuesPanelProps {
  issues: Issue[]
  /**
   * Called when the user activates an issue item.
   * The parent is responsible for moving focus to the offending node.
   */
  onActivate: (nodeId: string) => void
  /**
   * When set, displays a repository-level error (e.g. a failed save due to
   * schema validation failure) above the issue list.  Announced immediately
   * by assistive technology via `role="alert"`.
   */
  repositoryError?: string | null
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
 * - `repositoryError` is surfaced via `role="alert"` so it is announced
 *   immediately when set — satisfies OPS-535 AC that save errors appear in
 *   the issues panel and are clearly communicated to the author.
 */
export function IssuesPanel({ issues, onActivate, repositoryError }: IssuesPanelProps) {
  return (
    <section aria-label="Issues">
      <h2>Issues</h2>
      {repositoryError && (
        <p role="alert" style={{ color: 'red' }}>
          {repositoryError}
        </p>
      )}
      {issues.length === 0 && !repositoryError ? (
        <p>No issues found.</p>
      ) : issues.length > 0 ? (
        <ul>
          {issues.map((issue) => (
            <li key={issue.id}>
              <button type="button" onClick={() => onActivate(issue.nodeId)}>
                <strong>{issue.nodeTitle}</strong>: {issue.message}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
