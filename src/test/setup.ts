import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { toHaveNoViolations } from 'jest-axe'
import { expect } from 'vitest'

// @testing-library/react only registers its afterEach(cleanup) hook when the
// test framework exposes `afterEach` as a global.  Vitest does not do this by
// default (globals: false), so we register cleanup explicitly here so renders
// do not accumulate across tests within the same file.
afterEach(cleanup)

expect.extend(toHaveNoViolations)
