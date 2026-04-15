/** Discriminant codes for typed store action failures. */
export type StoreErrorCode = 'TERMINAL_NODE_MUTATION' | 'NODE_NOT_FOUND'

/**
 * Thrown by store actions when a mutation would violate a schema invariant
 * or reference a node that does not exist in the current document.
 *
 * The `code` field allows callers to discriminate errors programmatically
 * without string-matching the `message`.
 */
export class StoreActionError extends Error {
  readonly code: StoreErrorCode

  constructor(message: string, code: StoreErrorCode) {
    super(message)
    this.name = 'StoreActionError'
    this.code = code
  }
}
