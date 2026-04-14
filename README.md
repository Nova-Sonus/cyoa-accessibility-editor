# Nova Sonus CYOA Editor

An accessibility-first, in-browser authoring environment for Nova Sonus choose-your-own-adventure content. Content creators, sighted and visually impaired, construct adventure structure and narrative against the canonical `CYOA_Schema.json` in a single integrated tool. WCAG 2.2 Level AA conformance is a release gate.

Implements epic [OPS-517](https://novasonus.atlassian.net/browse/OPS-517).

---

## Prerequisites

- Node.js 22+
- Yarn 1.22+

---

## Getting started

```bash
yarn install
yarn dev
```

The dev server starts at `http://localhost:5173`.

---

## Scripts

| Script | Description |
|---|---|
| `yarn dev` | Start the Vite dev server |
| `yarn build` | Type-check then produce a production build |
| `yarn preview` | Serve the last production build locally |
| `yarn typecheck` | Run `tsc` against both `src/` and config files |
| `yarn generate-types` | Regenerate `src/types/adventure.generated.ts` from `src/schema/CYOA_Schema.json` |
| `yarn test` | Run Vitest once with v8 coverage |
| `yarn test:watch` | Run Vitest in watch mode |
| `yarn test:e2e` | Run Playwright end-to-end tests (Chromium) |

---

## Project structure

```
cyoa-editor/
├── .github/workflows/ci.yml       # CI: typecheck → unit tests → e2e
├── e2e/                            # Playwright end-to-end tests
├── fixtures/
│   └── Caves_Of_Bane.json          # Classifier and round-trip test fixture
├── src/
│   ├── schema/
│   │   └── CYOA_Schema.json        # Canonical adventure schema (source of truth)
│   ├── types/
│   │   ├── adventure.generated.ts  # Machine-generated — do not edit directly
│   │   └── adventure.ts            # Domain aliases: Adventure, AdventureNode, Choice, NodeType
│   ├── validation/
│   │   ├── validator.ts            # Ajv-compiled validateAdventure() and getValidationErrors()
│   │   └── validator.test.ts
│   ├── test/
│   │   └── setup.ts                # jest-axe matchers registered for Vitest
│   ├── App.tsx
│   └── main.tsx
├── index.html                      # lang="en-GB"
├── vite.config.ts                  # Vitest config inline (jsdom, v8 coverage, 90% thresholds)
├── playwright.config.ts
├── tsconfig.json                   # strict + noUnusedLocals + noUnusedParameters
└── tsconfig.node.json              # Separate config for Vite/Playwright config files
```

---

## Tech stack

Matches the Nova Sonus player application to maximise tooling reuse.

| Concern | Library |
|---|---|
| UI framework | React 19 (strict mode, function components) |
| Type system | TypeScript 5 (strict mode, enforced in CI) |
| State management | Zustand 5 |
| Build | Vite 7 |
| Unit / integration tests | Vitest 3 |
| End-to-end tests | Playwright (Chromium) |
| Accessibility testing | jest-axe (unit), @axe-core/playwright (e2e) |
| Schema validation | Ajv 8 (compiled against `CYOA_Schema.json`) |
| TTS preview | Web Speech API |
| Local file persistence | File System Access API → `LocalFileRepository` |
| Offline draft persistence | IndexedDB → `IndexedDBRepository` |
| Cloud persistence | Supabase → `SupabaseRepository` |

---

## Schema

All adventures conform to `src/schema/CYOA_Schema.json` (JSON Schema draft-07).

**Required node fields:** `id`, `title`, `node_type`, `narrativeText`, `choices`

**Optional node fields:** `entry_foley`, `music`, `sounds`, `activities`, `checkpoint`

**`node_type` values:** `start` · `decision` · `scene_start` · `narrative` · `combat` · `puzzle` · `end` · `adventure_success`

Terminal types (`end`, `adventure_success`) must have an **empty** `choices` array — enforced by the schema `if/then` clause, the store, and the UI.

### Regenerating TypeScript types

Run `yarn generate-types` after modifying `src/schema/CYOA_Schema.json`. This overwrites `src/types/adventure.generated.ts`. The stable domain aliases in `src/types/adventure.ts` are hand-maintained and should be updated if the generated output changes shape.

---

## Testing

### Coverage thresholds

Global threshold is **90%** (statements, branches, functions, lines) enforced in CI. The classifier kernel (Story 3) targets **100%**.

### Accessibility

Zero axe-core violations is the merge gate. axe-core runs in two places:

- **Unit tests** — `jest-axe` via `src/test/setup.ts`, asserting on isolated rendered components
- **End-to-end tests** — `@axe-core/playwright`, asserting on full pages in both editing modes

JAWS manual testing is a release gate for each sprint that touches the outline mode.

---

## Architecture notes

- **`AdventureRepository` interface** is the only entry point to persistence. Concrete implementations (`LocalFileRepository`, `IndexedDBRepository`, `SupabaseRepository`) are injected at the composition root. Swapping implementations requires no changes to application code.
- **Classifier kernel** (Story 3) derives structural tags (`isOrphan`, `isTerminal`, `isBranch`, `isCheckpoint`, etc.) as pure functions on every state change. Tags are never stored in the document. Both the canvas and outline views are driven entirely from classifier output — no view-specific state exists.
- **`Adventure` type** is derived from `CYOA_Schema.json` at code-generation time. TypeScript strict mode enforces the schema shape throughout the codebase.

---

## CI

GitHub Actions runs on every push and pull request to `main`:

1. `yarn typecheck` — both `tsconfig.json` and `tsconfig.node.json`
2. `yarn test` — Vitest with coverage; build fails if thresholds are not met
3. `yarn test:e2e` — Playwright (Chromium); trace viewer artefacts uploaded on failure

Coverage reports and Playwright HTML reports are uploaded as workflow artefacts.

---

## Contributing

All user-facing copy is in **British English**. TypeScript `any` is forbidden — CI enforces strict mode. No class components; every component is a function component with hooks.
