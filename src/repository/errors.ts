/**
 * Thrown by repository implementations when an adventure document fails Ajv
 * schema validation on save(). Both InMemoryRepository and LocalFileRepository
 * throw this so callers can substitute either implementation safely (LSP).
 */
export class RepositoryValidationError extends Error {
  readonly validationErrors: string[]

  constructor(message: string, errors: string[]) {
    super(message)
    this.name = 'RepositoryValidationError'
    this.validationErrors = errors
  }
}
