import Ajv from 'ajv'
import schema from '../schema/CYOA_Schema.json'
import type { Adventure } from '../types/adventure'

// strictTypes: false — the schema's if/then compound omits an explicit
// "type": "array" on the maxItems keyword, which is valid JSON Schema draft-07
// but triggers Ajv's strict-mode heuristic. The runtime behaviour is correct.
const ajv = new Ajv({ strictTypes: false })
const compiledValidator = ajv.compile(schema as object)

/**
 * Returns true and narrows the type to Adventure when data conforms to
 * CYOA_Schema.json, including the if/then constraint that terminal nodes
 * must have an empty choices array.
 */
export function validateAdventure(data: unknown): data is Adventure {
  return compiledValidator(data)
}

/**
 * Returns a list of human-readable error messages for the given data.
 * Returns an empty array when the document is valid.
 */
export function getValidationErrors(data: unknown): string[] {
  validateAdventure(data)
  // Ajv always populates `message` for JSON Schema errors; the cast is safe.
  return compiledValidator.errors
    ? compiledValidator.errors.map((e) =>
        `${e.instancePath} ${e.message as string}`.trim(),
      )
    : []
}
