# CLAUDE.md — Nova Sonus CYOA Editor

Epic: OPS-517 · Due: 2026-06-01 · RNIB partnership requires WCAG 2.2 AA at release.

---

## Tech stack

| Concern | Choice |
|---|---|
| UI | React 19 — function components, hooks, strict mode, React Compiler |
| Language | TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, no `any` |
| State | Zustand vanilla store (`createStore`) distributed via React context |
| Build | Vite |
| Unit/integration tests | Vitest + `@testing-library/react` |
| A11y (component) | `vitest-axe` |
| E2e + a11y | Playwright + `@axe-core/playwright` |
| Schema validation | Ajv — compiled once at startup against `src/schema/CYOA_Schema.json` |
| Persistence | `AdventureRepository` interface; concrete impls injected at composition root |

---

## Commands

```bash
yarn test          # vitest run --coverage  (unit + integration)
yarn test:watch    # vitest (interactive)
yarn test:e2e      # playwright test
yarn typecheck     # tsc --noEmit (both tsconfigs)
yarn build         # typecheck + vite build
yarn generate-types  # regenerate src/types/adventure.generated.ts from schema
```

---

## Architecture rules

### Schema is source of truth
- All TypeScript types are derived from `src/schema/CYOA_Schema.json` via `json-schema-to-typescript`.
- Edit the schema, then run `yarn generate-types`. Never hand-edit `adventure.generated.ts`.
- Ajv validates after every mutation. The store enforces this — do not bypass it.

### Repository boundary
- Application code imports only the `AdventureRepository` **interface** from `src/repository/index.ts`.
- Concrete implementations (`InMemoryRepository`, `LocalFileRepository`) are constructed at the composition root (`App.tsx`) and never imported elsewhere.
- The barrel (`src/repository/index.ts`) uses `export type` exclusively — this is enforced by a runtime boundary test.
- `LocalFileRepository` (OPS-535) persists to `localStorage` under the `nova-sonus:` namespace. `save()` validates against the schema before writing and throws `RepositoryValidationError` for invalid documents. The class lives in `src/repository/LocalFileRepository.ts` and is **not** re-exported from the barrel.
- `AdventureMetadata` (`{ id, title, savedAt }`) is defined in `src/types/adventure.ts`. `LocalFileRepository` maintains a `nova-sonus:index` key in localStorage — an array of `AdventureMetadata` upserted on every `save()` using the first node's title. Both `LocalFileRepository` and `InMemoryRepository` implement `listMetadata(): Promise<AdventureMetadata[]>` — covered by the shared contract suite.

### Store
- Single Zustand vanilla store created by `createAdventureStore(repository)`.
- State shape: `{ adventureId, document, classifierCache }`.
- `classifierCache` is a `ReadonlyMap<NodeId, ClassifierTags>` recomputed after every mutation with reference-stable merging (unchanged nodes keep the same object reference to avoid unnecessary re-renders).
- Components subscribe via `useAdventureStore(selector)` — never call `store.getState()` inside React.
- The store is distributed via `AdventureStoreProvider` / `useAdventureStore` in `src/store/StoreContext.tsx`.

### Classifier kernel
- `classifyAll(graph)` and `classifyNode(graph, nodeId)` in `src/classifier/classifier.ts` are **pure functions** — no side effects, no imports from store or repository.
- Tags (`isOrphan`, `isTerminal`, `isJunction`, `isBranch`, `isLinearLink`, `isCheckpoint`, `sceneId`, `depth`, `unreachable`) are **derived**, never stored in the adventure document.
- Both view modes (canvas + outline) are driven from the same classifier output.
- **`classifyAll` is the efficient entry point.** `classifyNode` calls `classifyAll` internally — prefer `classifyAll` when tagging multiple nodes (e.g., the full canvas render) to avoid repeated full-graph traversals.
- **`sceneId` resolution**: multi-source BFS from all `start` nodes; first (shortest) path wins. A `scene_start` node itself inherits `sceneId` from its parent — only its *children* receive the scene's id. When a node is reachable via two different scenes, the scene on the shorter path wins.
- Internal helpers (`buildNodeMap`, `buildInDegreeMap`, `bfsFromStarts`) are exported for direct unit testing — they are not part of the public barrel.

### Issues panel
- `deriveIssues(document, classifierCache)` in `src/components/IssuesPanel/deriveIssues.ts` is a **pure function** — no side effects, no store imports.
- Issue kinds: `orphan`, `unreachable`, `dangling-reference`, `terminal-with-choices`. All are derived reactively; none are stored in event state.
- `IssuesPanel` is **always rendered** (never conditionally hidden). When there are no issues it shows an explicit "No issues found." message — satisfies the OPS-531 AC that the panel must not simply disappear.
- The consolidated `aria-live` region in the parent view announces the *count* when it changes ("N issues found", "N remaining", "No issues") — not once per issue. Use a `useEffect` watching `issues.length` with the debounced `announce()` helper.
- Activating an issue button calls `onActivate(nodeId)`, which sets `focusTargetId` in the parent. The existing `focusTitleOnMount` / `onFocusApplied` mechanism on `NodeRow` handles the actual focus shift.
- When a node transitions to a terminal type the store clears choices in the same transaction, so no `terminal-with-choices` issue is raised for that mutation. The transition is surfaced as a one-off `announce()` call ("N choices removed…"), not a persistent issue entry.
- `IssuesPanel` accepts an optional `repositoryError?: string | null` prop (OPS-535). When set it renders a `role="alert"` paragraph above the issue list so screen readers announce it immediately, and suppresses the "No issues found." message.

### Canvas view
- `CanvasView` lives in `src/components/CanvasView/`. It is a **read-only visual overview** — editing still happens in the outline view.
- Layout is computed by `computeLayout()` in `useCanvasLayout.ts` (pure function, no React, fully unit-testable). Nodes are positioned using the `depth` field from the classifier cache as the column (x-axis); orphan / unreachable nodes go in a separate far-right column.
- The SVG is `aria-hidden="true"`. The interactive / screen-reader interface is an accessible `<ul>` of `<button>` elements rendered below it — each button calls `onNodeActivate(nodeId)`.
- Within the SVG, interactive nodes use the **roving tabIndex** composite-widget pattern: only the selected node has `tabIndex={0}`; arrow keys move selection; Enter/Space activates.
- Clicking or activating a node calls `onNodeActivate(nodeId)` which is wired in `App.tsx` to switch to outline view and focus that node's title input (`pendingFocusId` → `OutlineView` `focusNodeId` prop).
- The `<div>` wrapping the SVG must carry `role="region"` for `aria-label` to be ARIA-valid (axe rule `aria-prohibited-attr`).
- `OutlineView` now accepts optional `focusNodeId` and `onFocusConsumed` props — a `useEffect` converts the incoming id into the internal `focusTargetId` state and immediately calls `onFocusConsumed` so the parent can clear the prop for future activations.

### Composition root
- `App.tsx` is the only place `LocalFileRepository` (or any concrete repo) is constructed.
- The store is created once with `useRef` and passed to `AdventureStoreProvider`.
- `App.tsx` owns the `activeView: 'outline' | 'canvas'` state and the `pendingFocusId` plumbing between canvas activation and outline focus.
- On mount, `App.tsx` calls `repo.list()` and auto-loads the most recently saved adventure (OPS-535).
- The "New adventure" button in `App.tsx` creates a minimal schema-valid document, saves it to the repo, then loads it via the store.
- `OutlineView` owns the "Save adventure" button. Save errors (including `RepositoryValidationError`) are caught there and forwarded to `IssuesPanel` as `repositoryError`. **Do not move Save to the header** — `isSaving` and `repositoryError` must remain co-located with the component that owns the action.
- The view toggle uses `role="tablist"` / `role="tab"` / `aria-selected`. Both `OutlineView` and `CanvasView` are **always mounted**; the inactive panel carries the HTML `hidden` attribute (never unmounted). This keeps `aria-controls` references valid (axe rule) and preserves view state across switches.

### UI and styling

- **CSS modules** — all components use CSS modules. No inline styles in production code. CSS module type declarations live in `src/vite-env.d.ts` (declares `*.module.css` → `{ readonly [key: string]: string }`). Vite resolves CSS module imports at build time; TypeScript trusts the declaration.
- **Design tokens** live in `src/styles/tokens.ts`: `NODE_COLOURS` (border / bg / badge / text per node_type) and `CLASSIFIER_BADGES` (label / bg / fg / border per classifier tag). Components set CSS custom properties on the element (`style={{ '--node-border': colours.border }}`); modules reference `var(--node-border)`.
- **Fonts** — DM Sans and Source Serif 4 are self-hosted in `public/fonts/` and declared via `@font-face` in `src/styles/fonts.css`, imported once in `src/main.tsx`. Never load fonts from Google Fonts (cross-origin + GDPR concern).
- **Node card accordion** — `NodeRow` uses the `<button aria-expanded>` disclosure pattern, **not** `<details>`/`<summary>`. CSS modules control the open/closed header background via `[aria-expanded="true"]` selector on the button.
- **Shared primitives** (`src/components/ui/`): `TypeBadge`, `ClassifierTag`, `CheckpointIndicator`, `FieldGroup`, `Field`, `SelectField`, `ComboField`. These are zero-dependency presentational components; import them everywhere type badges or form fields appear.
- **`NodeIndex`** (`src/components/NodeIndex/`) — sidebar quick-nav; a `<nav aria-label="Node index">` of `<button>` elements. Each entry: coloured dot (from `NODE_COLOURS` badge token) + truncated title + amber `data-testid="checkpoint-indicator"` bar (aria-hidden) when `checkpoint === true`. Arrow keys (Up/Down) navigate between entries. Activating a button calls `onActivate(nodeId)`, wired in `OutlineView` to set `focusTargetId` — the existing `focusTitleOnMount` / `onFocusApplied` mechanism handles the expand + focus.
- **Two-column layout** (`OutlineView`) — `OutlineView` renders a flex row: `nodeListColumn` (flex 1, min-width 0) + `<aside aria-label="Sidebar">` (280 px, sticky top 0). Collapses to single column below 900 px via media query. The sidebar contains three widgets: NodeIndex, IssuesPanel (card wrapper: amber when issues/error, green when clean), AssetManifest (compact chip display). **Rules of Hooks**: all `useMemo` hooks must be declared before the `if (document.length === 0)` early return — placing hooks after a conditional return causes a "Rendered more hooks" crash when the document transitions from empty to loaded.
- **`AssetManifest` compact prop** — `<AssetManifest document={doc} compact />` renders filenames as pill chips (`chipList` / `chip` CSS module classes) with heading "Asset manifest (N)". Default (no prop) renders the original labelled list with heading "Asset manifest".
- **"Add node" button** — at the bottom of the `<ul>` in `OutlineView`. Creates a narrative stub via `store.addNode` and sets `focusTargetId` to the new node's id.

---

## Testing conventions

- **Coverage thresholds**: 90% lines/functions/branches/statements on all files under `src/` (excluding `src/types/`, `src/schema/`, `src/main.tsx`, `src/App.tsx`, `src/test/`).
- **Contract pattern**: shared suites live in `contract.ts` (not `contract.test.ts`) and export a `defineContractSuite(name, factory)` function. Future repository implementations call this with their own factory.
- **Zero axe-core violations** is a merge gate. Use `jest-axe` in component tests and `@axe-core/playwright` in e2e.
- Fixture files live in `fixtures/` at the repo root. Two fixtures are in use: `Caves_Of_Bane.json` (has a known `choiceResponseConstaint` typo — see OPS-517 data-quality note; do not validate it with Ajv in tests) and `a_strange_day_at_the_zoo.json` (schema-valid).

### Vitest + React component test infrastructure

**Problem**: Vitest's jsdom environment sets `process.env.NODE_ENV = 'production'` before any setup code runs. React and `react-dom` read `NODE_ENV` at first `require()` and load their production bundles. The production `react-dom/test-utils` bundle calls `React.act()`, which is absent in the production React bundle — this crashes every `@testing-library/react` `render()` call with `TypeError: React.act is not a function`.

**Fix — two-file setup** (`vite.config.ts` lists both in order):
1. `src/test/env.ts` — **zero imports**; sets `process.env.NODE_ENV = 'test'`. Because it has no static imports, there is nothing to hoist, so the assignment executes immediately before Vitest evaluates the next setup file's imports.
2. `src/test/setup.ts` — imports `@testing-library/react`, `jest-axe`, etc. By the time these imports are resolved, `NODE_ENV` is already `'test'`, so React/react-dom load their development bundles (which include `act`).

**Auto-cleanup**: `@testing-library/react` only registers `afterEach(cleanup)` automatically when `afterEach` is a global. Vitest does not expose globals by default (`globals: false`). Without explicit cleanup, renders accumulate across tests in the same file and `screen.getByLabelText()` finds stale elements from earlier tests. `setup.ts` registers `afterEach(cleanup)` explicitly to fix this.

**`@testing-library/jest-dom` DOM matchers** (added OPS-538): `setup.ts` imports `@testing-library/jest-dom/vitest` — this both calls `expect.extend(matchers)` via vitest's `expect` and augments the TypeScript `Assertion` type, enabling `.toBeInTheDocument()`, `.toHaveAttribute()`, `.toBeDisabled()` etc. The bare `import '@testing-library/jest-dom'` side-effect import does NOT work in this setup because it calls the global `expect` which is absent when globals are disabled.

**v8 coverage double-reporting** (fixed OPS-538): On Windows with Git Bash, the v8 coverage provider reports each file twice — once from runtime instrumentation and once from the `include: ['src/**']` filesystem scan — halving all coverage figures. Fixed with `all: false` in `vite.config.ts` coverage options, which disables the filesystem scan and reports only files actually executed during tests.

---

## Coding conventions

- **British English** in all user-facing copy (UI labels, error messages, narrative text).
- No `any` — use `unknown` with a type guard or assertion through `unknown` when needed.
- Prefer `type` imports (`import type`) for anything that is only used as a type.
- Async actions in the store are `async` functions; sync mutations are plain functions.
- `StoreActionError` (in `src/store/errors.ts`) is the typed error for store-layer failures. Two codes exist:
  - `TERMINAL_NODE_MUTATION` — `addChoice` was called on a terminal node (`end` / `adventure_success`).
  - `NODE_NOT_FOUND` — an action targeted a node id absent from the document.
- When `updateNode` transitions a node's `node_type` to a terminal type, the store **clears `choices`** in the same transaction rather than rejecting the change. The document is always schema-valid after the call returns.

---

## Story map (OPS-517 children)

| # | Jira | Title | Status |
|---|---|---|---|
| 1 | OPS-525 | Foundation — scaffold, types, Ajv, CI | Done |
| 2 | OPS-526 | Repository interface + InMemoryRepository | Done |
| 3 | OPS-527 | Classifier kernel | Done |
| 4 | OPS-528 | State store | Done |
| 5 | OPS-529 | Outline mode | Done |
| 6 | OPS-530 | Choice editing + nextNode combobox | Done |
| 7 | OPS-531 | Issues panel | Done |
| 8 | OPS-532 | Audio fields + asset manifest | Done |
| 9 | OPS-533 | Activities, choiceResponseConstraint, checkpoint editing | Done |
| 10 | OPS-534 | Canvas mode | Done |
| 11 | OPS-535 | Concrete repository (LocalFile or Supabase) | Done |
| 12 | OPS-538 | Design tokens and shared UI component library | Done |
| 13 | OPS-539 | App chrome — header, legend bar, and view toggle | Done |
| 14 | OPS-540 | Node card visual redesign, stats bar, and Add Node | Done |
| 15 | OPS-541 | Two-column layout and sidebar widgets | Done |
| 16 | OPS-542 | Open adventure — selection dialog and metadata index | Done |
| 17 | OPS-537 | TTS preview of narrativeText via Web Speech API | — |
| 18 | OPS-536 | Accessibility audit and JAWS validation | — |

Implementation order: 538 → 539 → 540 → 541 → 542 → 537 → 536. OPS-542 done 2026-04-19. OPS-537 is next (TTS placeholder button landed in OPS-540). OPS-536 runs last when the full visual shell is in place.
