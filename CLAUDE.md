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
- State shape: `{ adventureId, document, classifierCache, selectedNodeId }`.
- `classifierCache` is a `ReadonlyMap<NodeId, ClassifierTags>` recomputed after every mutation with reference-stable merging (unchanged nodes keep the same object reference to avoid unnecessary re-renders).
- `selectedNodeId: string | null` tracks the currently selected node for the companion panel; set via `setSelectedNodeId(id)`.
- `previousNodeId: string | null` holds the id of the node selected immediately before the current one; updated inside `setSelectedNodeId` whenever a non-null id is passed. Supplies "arrived from" context for canvas ARIA announcements.
- Components subscribe via `useAdventureStore(selector)` — never call `store.getState()` inside React.
- The store is distributed via `AdventureStoreProvider` / `useAdventureStore` in `src/store/StoreContext.tsx`.

### Classifier kernel
- `classifyAll(graph)` and `classifyNode(graph, nodeId)` in `src/classifier/classifier.ts` are **pure functions** — no side effects, no imports from store or repository.
- Tags (`isOrphan`, `isTerminal`, `isJunction`, `isBranch`, `isLinearLink`, `isCheckpoint`, `sceneId`, `depth`, `unreachable`) are **derived**, never stored in the adventure document.
- Both view modes (canvas + outline) are driven from the same classifier output.
- **`classifyAll` is the efficient entry point.** `classifyNode` calls `classifyAll` internally — prefer `classifyAll` when tagging multiple nodes (e.g., the full canvas render) to avoid repeated full-graph traversals.
- **`sceneId` resolution**: multi-source BFS from all `start` nodes; first (shortest) path wins. A `scene_start` node itself inherits `sceneId` from its parent — only its *children* receive the scene's id. When a node is reachable via two different scenes, the scene on the shorter path wins.
- Internal helpers (`buildNodeMap`, `buildInDegreeMap`, `bfsFromStarts`) are exported for direct unit testing — they are not part of the public barrel. Exception: `sceneGraph.ts` (OPS-578) imports `buildNodeMap` + `bfsFromStarts` directly so the flow canvas shares the classifier's exact shortest-path rule.
- `bfsFromStarts` also returns `parent: Map<NodeId, NodeId>` — each node's **home parent** (the node that first reached it; choices visited in order). Absent for start and unreachable nodes.

### Issues panel
- `deriveIssues(document, classifierCache)` in `src/components/IssuesPanel/deriveIssues.ts` is a **pure function** — no side effects, no store imports.
- Issue kinds: `orphan`, `unreachable`, `dangling-reference`, `terminal-with-choices`. All are derived reactively; none are stored in event state.
- `IssuesPanel` is **always rendered** (never conditionally hidden). When there are no issues it shows an explicit "No issues found." message — satisfies the OPS-531 AC that the panel must not simply disappear.
- The consolidated `aria-live` region in the parent view announces the *count* when it changes ("N issues found", "N remaining", "No issues") — not once per issue. Use a `useEffect` watching `issues.length` with the debounced `announce()` helper.
- Activating an issue button calls `onActivate(nodeId)`, which sets `focusTargetId` in the parent. The existing `focusTitleOnMount` / `onFocusApplied` mechanism on `NodeRow` handles the actual focus shift.
- When a node transitions to a terminal type the store clears choices in the same transaction, so no `terminal-with-choices` issue is raised for that mutation. The transition is surfaced as a one-off `announce()` call ("N choices removed…"), not a persistent issue entry.
- `IssuesPanel` accepts an optional `repositoryError?: string | null` prop (OPS-535). When set it renders a `role="alert"` paragraph above the issue list so screen readers announce it immediately, and suppresses the "No issues found." message.

### Companion panel
- `CompanionPanel` lives in `src/components/CompanionPanel/`. It is the primary editing surface in canvas-with-companion mode and must remain mounted whenever canvas mode is active — never conditionally unmount it.
- Subscribes to `selectedNodeId`, `document`, `classifierCache`, and `updateNode` from the store via granular selectors.
- When no node is selected it renders a placeholder ("Select a node to edit").
- Fields rendered: `id` (labelled "Node ID", disabled), `title`, `node_type` (select, all 8 enum values), `narrativeText` (textarea). All four field components read directly from the store document and call `updateNode` on every `onChange` — no local draft state. The "without remount" guarantee comes from always deriving values from the store, not resetting local state.
- TTS placeholder: a disabled `<button>` labelled "🔊 TTS" with `title="Coming soon"` sits to the right of the Narrative text label — layout uses a flex `narrativeHeader` row above the textarea (not positioned inside it).
- Header shows a `TypeBadge` plus classifier tag badges: boolean tags (`isOrphan → 'orphan'`, `unreachable`, `isJunction → 'junction'`, `isBranch → 'branch'`, `isLinearLink → 'linear_link'`, `isCheckpoint → 'checkpoint'`) use the existing `ClassifierTag` component; `isTerminal`, `sceneId` (truncated to 8 chars), and finite `depth` render as inline `metaTag` spans with their own CSS custom properties (`--meta-bg`, `--meta-fg`, `--meta-border`).

### Canvas view (OPS-576 — swimlane + spotlight model)
- `CanvasView` lives in `src/components/CanvasView/`. Renders a scene-swimlane layout (replaced the old SVG graph in OPS-576).
- **Layout**: flex column — `SpotlightBreadcrumb` (when active) + `div.layout` (flex row: `swimlaneArea` left, `sidebar` right 280 px).
- **Swimlane area**: `<div role="region" aria-label="Scene swimlanes">` — vertical stack of: `<section aria-label="Unscoped nodes">` (preamble, nodes where `sceneId=null`) + `SceneLane` × N (one per entry in `groupByScene` output).
- **Sidebar**: `NodeDetail` (flex 1, shows spotlighted node details) above `InterSceneConnectors` (max-height 240 px, scrollable).
- **Spotlight interaction**: `useSpotlight(allNodes)` provides `focusNodeId`, `spotlightNodeIds`, `breadcrumb`, `activate`, `clear`, `navigateTo`. Internal `handleNodeActivate(nodeId)` calls `spotlight.activate(nodeId)` + `store.setSelectedNodeId(nodeId)` (updates CompanionPanel). This is called by MiniNode, NodeDetail choices, and InterSceneConnectors buttons.
- **`onNodeActivate` prop**: used ONLY for the NodeDetail "Edit in outline" footer button → switches to outline view. In App.tsx, `handleCanvasNodeActivate` calls `setSelectedNodeId` + `setPendingFocusId` + `setActiveView('outline')`.
- **`NodeDetail.onEdit?`**: optional prop; when provided, renders a footer button "Edit in outline". In CanvasView, `onEdit={onNodeActivate}` (the prop from App.tsx).
- `computeLayout()` in `useCanvasLayout.ts` and the old SVG/pan/zoom code are retained (dead code) — still tested by `CanvasView.test.tsx` pure function tests.
- `OutlineView` accepts optional `focusNodeId` and `onFocusConsumed` props — a `useEffect` converts the incoming id into internal `focusTargetId` and calls `onFocusConsumed` to clear the prop.

### Canvas utilities (OPS-570)
- `canvasUtils.ts` contains four pure functions (no React, no store imports), fully unit-tested against both fixtures:
  - `getNeighbours(nodes, nodeId)` → `{ parents, children, all }` — one-hop neighbourhood sets.
  - `getInterSceneEdges(nodes, cache)` → `InterSceneEdge[]` — edges crossing scene boundaries; each entry has `from`, `to`, `label`, `fromScene`, `toScene`, `isBack` (`isBack = true` when target scene depth ≤ source scene depth).
  - `groupByScene(nodes, cache)` → `Map<sceneId, AdventureNode[]>` — partitions nodes by classifier `sceneId`; nodes with `sceneId=null` (preamble, orphans) are excluded.
  - `getSceneFlowIndicators(nodes, cache, sceneId)` → `{ inbound: Set<string>, outbound: Set<string> }` — which other named scenes flow into / out of a given scene.

### SceneLane (OPS-571)
- `SceneLane` (`src/components/CanvasView/SceneLane.tsx`) — collapsible `<section aria-label="Scene: …">` containing all nodes for one scene.
- **Header**: `<button aria-expanded>` with chevron (aria-hidden), scene title (from `allNodes.find(n => n.id === sceneId)?.title`), scene-id badge, node count, checkpoint count (hidden when 0), inbound `←` and outbound `→` flow-indicator chips (scene titles resolved from `allNodes`).
- **Body**: `flex-wrap` row of `MiniNode` cards with `gap: 10px`. Unmounted when collapsed (not hidden).
- **Spotlight ring**: `data-spotlighted` attribute is present (empty string) when `spotlightNodeIds !== null` and any lane node is in that set. CSS rule `.lane[data-spotlighted]` applies a `box-shadow` ring using `var(--lane-border)`.
- **Colour**: `--lane-border` is always `NODE_COLOURS['scene_start'].border` (`#7c3aed`).
- Collapse state is **local `useState`** — not in the store.
- Props: `sceneId`, `nodes`, `allNodes`, `classifierCache`, `spotlightNodeIds: ReadonlySet<string> | null`, `onNodeActivate`.

### MiniNode (OPS-572)
- `MiniNode` (`src/components/CanvasView/MiniNode.tsx`) — compact `<button>` (160 px wide) for one node inside a `SceneLane`.
- `aria-label` carries the full accessible description (title + type + checkpoint/orphan/unreachable qualifiers); inner `<span>` elements are `aria-hidden`.
- Checkpoint amber bar: absolute-positioned `<span class={styles.checkpointBar}>` on the left edge.
- Styled via CSS custom properties `--mini-border`, `--mini-bg`, `--mini-badge-bg`, `--mini-text` set from `NODE_COLOURS[node.node_type]`.
- **Spotlight states** (`spotlightState?: SpotlightState`, default `'normal'`): `'focus'` — `scale(1.06)` + `box-shadow` ring using `--mini-border`; `'neighbour'` — full opacity; `'dimmed'` — `opacity: 0.35` + `scale(0.97)`; `'normal'` — no modifier. The `data-spotlight` attribute is set to the state value (omitted when `'normal'`) for CSS hooks and testing.
- `SpotlightState` is exported from `MiniNode.tsx` for reuse in `SceneLane` and future assembly (OPS-576).
- `SceneLane` accepts `focusNodeId: string | null` alongside `spotlightNodeIds`. The module-private `computeSpotlightState(nodeId, focusNodeId, spotlightNodeIds)` derives the correct state per node and passes it as `spotlightState` to each `MiniNode`.

### Spotlight interaction (OPS-573)
- **`useSpotlight(allNodes)`** hook (`src/components/CanvasView/useSpotlight.ts`) — manages all spotlight state; returns `SpotlightHandle`:
  - `focusNodeId: string | null` — last entry in breadcrumb, or `null` when inactive.
  - `spotlightNodeIds: ReadonlySet<string> | null` — focus node + its one-hop neighbours (via `getNeighbours`); `null` when inactive.
  - `breadcrumb: readonly string[]` — ordered history of focused node IDs (current focus is last).
  - `activate(nodeId)` — appends to breadcrumb, or truncates back to an existing entry if already present; no-op if `nodeId` is already the current focus.
  - `clear()` — deactivates spotlight and empties breadcrumb.
  - `navigateTo(index)` — truncates breadcrumb to `index`; no-op if already at or past that point.
- **`SpotlightBreadcrumb`** (`src/components/CanvasView/SpotlightBreadcrumb.tsx`) — presentational component; returns `null` when `breadcrumb` is empty.
  - Renders `<nav aria-label="Spotlight trail">` with an `<ol>` of breadcrumb entries and a "Clear spotlight" dismiss button.
  - Prior entries are `<button>` elements (clicking calls `onNavigate(index)`); the current (last) entry is a `<span aria-current="true">` — not interactive, since you're already there.
  - Node IDs are resolved to titles via `allNodes`; falls back to the raw ID if not found.
  - Styled via `SpotlightBreadcrumb.module.css`.
- OPS-576 will wire `useSpotlight` into `CanvasView`: `activate` is called from `SceneLane`'s `onNodeActivate`; `focusNodeId`, `spotlightNodeIds`, and `breadcrumb` drive `SceneLane` props and the breadcrumb strip above the swimlanes.

### Flow canvas — scene graph (OPS-578, part of OPS-577)
- OPS-577 replaces the swimlane canvas with a left-to-right flow canvas: scenes as collapsible boxes, nodes inside each scene as a tidy tree, extra links routed around boxes. Positions are always computed, never stored. Sidebar, spotlight and breadcrumb are reused.
- `buildSceneGraph(nodes)` in `src/components/CanvasView/sceneGraph.ts` — pure; returns `{ groups, groupOf, homeParent, treeChildren, column, links }`.
- **Groups** (`SceneGroup`): `preamble` (key `PREAMBLE_KEY`, roots = start nodes), one `scene` per reachable `scene_start` (key `sceneKey(id)` = `scene:<id>`, root = the scene_start), and `unreachable` (key `UNREACHABLE_KEY`, last). Order: preamble, scenes in BFS discovery order, unreachable. Each has `rootIds`, `nodeIds` (BFS order), `parentKey`, `childKeys`.
- **Layout membership differs from classifier `sceneId` on one point**: the classifier tags a `scene_start` with its *parent's* scene; the scene graph makes it the *entry (root)* of its own group. All other nodes match `sceneId` exactly (asserted against both fixtures).
- `column` = tree distance from the group root (entries are 0); equals classifier `depth − depth(root)` for reachable nodes. `treeChildren` holds same-group children only, in choice order; scene entries are reached via their home parent in `homeParent`.
- **Link kinds** (`ClassifiedLink.kind`): `tree` (first choice from the home parent), `back` (same group, target column ≤ source), `cross` (other same-group link), `scene` (into another scene's entry), `scene-cross` (into another group elsewhere). Dangling targets are skipped; `choiceIndex` is preserved.
- Unreachable nodes get home parents from `growUnreachableForest`: BFS restricted to unreachable nodes, seeded in document order with nodes that have no unreachable predecessor first (orphans), then remaining cycles. Unreachable `scene_start` nodes do not open scenes.

### Flow canvas — tree layout (OPS-579)
- `layoutGroup(graph, groupKey, metrics?)` in `src/components/CanvasView/treeLayout.ts` — pure; returns `{ nodes: Map<NodeId, NodeBox>, width, height }` with coordinates relative to the group's top-left (0,0). Throws for an unknown group key.
- `LayoutMetrics` / `DEFAULT_METRICS`: `nodeWidth 160` (matches `MiniNode`), `nodeHeight 52` (**`MiniNode` must render at exactly this height on the flow canvas**), `columnGap 64` (gutter used for link routing), `rowGap 16`. Tune here, not in callers.
- **Band layout** (not Reingold–Tilford compaction): each subtree owns a band tall enough for its leaves; sibling bands stack in choice order; a parent is centred between its first and last child; multiple roots stack in root order. Growing a subtree pushes later siblings down; existing siblings never reorder. `x = column × (nodeWidth + columnGap)`.
- A node only moves to a different column if a new link gives it a shorter path from start (its home parent changes) — inherent to the shortest-path rule.
- Measured on Caves of Bane: `buildSceneGraph` ≈ 0.3 ms; `layoutGroup` ≈ 0.03 ms for the largest scene (50 nodes), ≈ 0.07 ms for all 12 groups.

### InterSceneConnectors (OPS-574)
- `InterSceneConnectors` (`src/components/CanvasView/InterSceneConnectors.tsx`) — sidebar panel listing every edge that crosses a scene boundary.
- Props: `edges: InterSceneEdge[]` (from `getInterSceneEdges`), `allNodes: Adventure` (title resolution), `onActivate: (nodeId: string) => void`.
- Always rendered; shows "No inter-scene connections." when `edges` is empty.
- Each edge renders as a `<button>` with two rows: scene line (`fromScene title → toScene title` + amber **↩ back** badge when `isBack`) and an italic choice-label row (`via "…"`, omitted when label is empty string).
- Clicking calls `onActivate(edge.from)` — navigates to the source node that carries the cross-scene choice.
- Scene and node titles are resolved from `allNodes`; falls back to the raw id when not found.
- Landmark: `<section aria-label="Scene connections">`.
- Styled via `InterSceneConnectors.module.css`; back badge uses amber palette (`#fef3c7 / #92400e / #fde68a`) to visually distinguish loop/reverse jumps.

### NodeDetail (OPS-575)
- `NodeDetail` (`src/components/CanvasView/NodeDetail.tsx`) — read-only sidebar panel for the currently spotlighted node.
- Props: `node: Adventure[number] | null`, `tags: ClassifierTags | null`, `allNodes: Adventure`, `onActivate: (nodeId: string) => void`.
- **Placeholder** (`node === null`): `<aside aria-label="Node detail">` with italic "Spotlight a node to see its details." — no headings or buttons.
- **Active** (node present):
  - **Header**: `<h2>` title, `TypeBadge`, classifier tag row — boolean tags via `ClassifierTag`; `isTerminal`, `sceneId` (truncated to 8 chars), finite `depth` as inline `metaTag` spans with CSS custom properties (mirrors CompanionPanel). `tags === null` omits the tag row entirely.
  - **Narrative section** (`<section aria-labelledby>`): shows `node.narrativeText` in a `<p>`; "No narrative text." when empty.
  - **Choices section** (`<section aria-labelledby>`): heading includes count; each choice is a `<button>` showing `choiceText → resolvedTargetTitle`; falls back to `(untitled choice)` when `choiceText` is empty and to raw node id when the target is not in `allNodes`; clicking calls `onActivate(choice.nextNode)`. "No choices." when `choices` is empty.
  - **Footer**: monospace node id.
- Styled via `NodeDetail.module.css`; header background/border driven by `NODE_COLOURS` CSS custom properties `--node-bg` / `--node-border`.
- Heading hierarchy: `<h2>` for node title, `<h3>` for section headings — IDs scoped to `nd-{section}-{node.id}` to support `aria-labelledby`.

### Composition root
- `App.tsx` is the only place `LocalFileRepository` (or any concrete repo) is constructed.
- The store is created once with `useRef` and passed to `AdventureStoreProvider`.
- `App.tsx` owns the `activeView: 'outline' | 'canvas'` state and the `pendingFocusId` plumbing between canvas activation and outline focus.
- On mount, `App.tsx` calls `repo.list()` and auto-loads the most recently saved adventure (OPS-535).
- The "New adventure" button in `App.tsx` creates a minimal schema-valid document, saves it to the repo, then loads it via the store.
- The "Open" button in `App.tsx` calls `repo.listMetadata()`, stores the result in `openDialogMetadata` state, then sets `openDialogVisible = true`. `OpenDialog` receives metadata as a prop (App.tsx owns the fetch — the dialog is purely presentational). On selection, `handleSelectAdventure` closes the dialog, calls `store.loadAdventure(id)`, and switches to outline view.
- `OpenDialog` uses the native `<dialog>` element with `showModal()` / `close()` called from a `useEffect` that watches `isOpen`. The `cancel` event (Escape key) is intercepted with `e.preventDefault()` and routed to `onClose` so the parent controls state. **CSS rule**: `display: flex` must be scoped to `.dialog[open]` — setting it on `.dialog` directly overrides the UA `display:none` for a closed dialog and leaks headings into the accessibility tree.
- **Save button is in `AppHeader`** (moved in OPS-544). `isSaving` and `saveError` state live in `App.tsx`; `handleSave` is defined there and passed as `onSave` to `AppHeader`. Save errors render as `role="alert"` inside the header. Do **not** move Save back to `OutlineView`.
- The view toggle uses `role="tablist"` / `role="tab"` / `aria-selected`. Both `OutlineView` and `CanvasView` are **always mounted**; the inactive panel carries the HTML `hidden` attribute (never unmounted). This keeps `aria-controls` references valid (axe rule) and preserves view state across switches.
- **Canvas mode is the default view** (`activeView` initialises to `'canvas'`). Canvas tabpanel is a flex row: `CompanionPanel` (320 px, fixed width) on the left, `CanvasView` (flex 1) on the right. Outline tabpanel is full-width `OutlineView`.

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
- **`OpenDialog`** (`src/components/OpenDialog/`) — native `<dialog>` modal for selecting a saved adventure. Props: `isOpen`, `metadata: AdventureMetadata[]`, `onSelect(id)`, `onClose`. Uses `showModal()` / `close()` imperatively. `::backdrop` provides the overlay. **Critical CSS trap**: `display: flex` must be on `.dialog[open]`, not `.dialog` — the latter overrides the UA `display:none` on a closed dialog, making its headings visible to heading-order e2e tests even when the dialog is shut.
- **`CompanionPanel`** (`src/components/CompanionPanel/`) — primary node editing surface in canvas mode. Renders a 320 px `<aside aria-label="Node editor">`. When no node is selected, shows a placeholder. When selected: (1) header with `<h2>` node title + `TypeBadge` + classifier tag badges; (2) scrollable body with four `FieldGroup` sections — **Narrative** (Node ID, Title, Node type, Narrative text + disabled TTS), **Audio** (entry_foley, music, sounds — each an `AudioComboField`), **Gameplay** (checkpoint checkbox, activities add/delete list), **Choices** (per-choice rows with choiceText, constraint, `NodeComboField`; terminal message; + Add choice); (3) footer with Delete node (guarded by confirmation, suppressed for `start` nodes) and Node ID label. `NodeComboField` is a module-private WAI-ARIA combobox (`role="combobox"` / `role="listbox"` / `role="option"`) that shows node titles with colour dots and a "Create new node…" sentinel that creates a `decision` stub via `addNode` + `updateChoice`. All hooks must be declared **before** the `if (node == null)` early return.

---

## Testing conventions

- **Coverage thresholds**: 90% lines/functions/branches/statements on all files under `src/` (excluding `src/types/`, `src/schema/`, `src/main.tsx`, `src/App.tsx`, `src/test/`).
- **Contract pattern**: shared suites live in `contract.ts` (not `contract.test.ts`) and export a `defineContractSuite(name, factory)` function. Future repository implementations call this with their own factory.
- **Zero axe-core violations** is a merge gate. Use `jest-axe` in component tests and `@axe-core/playwright` in e2e.
- Fixture files live in `fixtures/` at the repo root. Two fixtures are in use: `Caves_Of_Bane.json` and `a_strange_day_at_the_zoo.json`. Both are schema-valid.

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
| 17 | OPS-543 | UI Refinement 1 — Styles | In Progress |
| 18 | OPS-544 | CompanionPanel full rebuild + canvas layout restructure | Done |
| 19 | OPS-545 | Choice section is not styled | Done |
| 20 | OPS-546 | Issues unstyled | Done |
| 21 | OPS-547 | UI Refinement — editor functionality | In Progress |
| 22 | OPS-548 | Next nodes should use titles not node Id | Done |
| 23 | OPS-554 | Companion panel — core fields | Done |
| 24 | OPS-537 | TTS preview of narrativeText via Web Speech API | — |
| 25 | OPS-536 | Accessibility audit and JAWS validation | — |
| 26 | OPS-569 | Canvas mode: scene swimlanes with spotlight interaction | In Progress |
| – | OPS-570 | ↳ Canvas utilities: neighbourhood, inter-scene edges, scene grouping | Done |
| – | OPS-571 | ↳ SceneLane component with collapsible header and flow indicators | Done |
| – | OPS-572 | ↳ MiniNode canvas card with spotlight state variants | Done |
| – | OPS-573 | ↳ Spotlight mode interaction and breadcrumb trail | Done |
| – | OPS-574 | ↳ InterSceneConnectors sidebar panel with back-edge indicators | Done |
| – | OPS-575 | ↳ NodeDetail sidebar panel for spotlighted node | Done |
| – | OPS-576 | ↳ CanvasView assembly, store wiring, and accessibility pass | Done |
| 27 | OPS-577 | Adaptive visual view — left-to-right flow canvas with collapsible scenes | In Progress |
| – | OPS-578 | ↳ Scene graph utilities: scene membership, scene flow, link classification | Done |
| – | OPS-579 | ↳ Tidy-tree node layout within a scene | Done |
| – | OPS-580 | ↳ Scene layout: collapsible scene boxes arranged left to right | — |
| – | OPS-581 | ↳ Link routing: orthogonal connectors that never pass behind nodes | — |
| – | OPS-582 | ↳ Flow canvas view: replace swimlanes, reuse spotlight, breadcrumb and sidebar | — |
| – | OPS-583 | ↳ Animated re-layout and authoring from the canvas | — |
| – | OPS-584 | ↳ Flow canvas accessibility pass | — |

Implementation order: 538 → 539 → 540 → 541 → 542 → 543/544/545/546 → 547/548 → 554 → 544 → 537 → 536. OPS-545 done 2026-04-19: styled Choices section + created ChoiceRow.module.css. OPS-546 done 2026-04-19: created IssuesPanel.module.css. OPS-548 done 2026-04-19: nextNode select shows node titles not IDs. OPS-554 done 2026-04-20: `CompanionPanel` core fields; `selectedNodeId` + `setSelectedNodeId` + `previousNodeId` added to store. OPS-544 done 2026-04-20: CompanionPanel full rebuild (4 FieldGroup sections, NodeComboField, AudioComboField, ActivitiesList, delete-with-confirm footer); canvas default view; Save moved to AppHeader with `role="alert"` error; canvas tabpanel = CompanionPanel (320 px) + CanvasView flex row. OPS-566 done 2026-04-24: Import from file — `importAdventure` store action (bypasses repo, assigns fresh UUID); Import button in AppHeader; hidden file input in App.tsx; validation via `validateAdventure`/`getValidationErrors`; `importError` shown as `role="alert"`; `Caves_Of_Bane.json` typo fixed. OPS-570 done 2026-04-27: `canvasUtils.ts` — four pure canvas utility functions (`getNeighbours`, `getInterSceneEdges`, `groupByScene`, `getSceneFlowIndicators`) with full unit test coverage against both fixtures. OPS-571 done 2026-04-27: `SceneLane` (collapsible section with header badges + flow indicators + spotlight ring) and `MiniNode` (compact node button, placeholder for OPS-572) in `src/components/CanvasView/`; 21 tests, zero axe-core violations. OPS-572 done 2026-04-27: `MiniNode` spotlight state variants (`focus`/`neighbour`/`dimmed`/`normal`) — CSS opacity/transform per state, `data-spotlight` attribute, `SpotlightState` type exported; `SceneLane` gains `focusNodeId` prop and `computeSpotlightState()` helper; `MiniNode.test.tsx` added (18 tests); `SceneLane.test.tsx` extended with state pass-through + axe tests; 594 tests total, zero violations. OPS-573 done 2026-04-27: `useSpotlight(allNodes)` hook — breadcrumb state, `focusNodeId`, `spotlightNodeIds` (focus + one-hop neighbours), `activate`/`clear`/`navigateTo`; `SpotlightBreadcrumb` component — `<nav aria-label="Spotlight trail">` with prior entries as buttons and current entry as `<span aria-current="true">`, dismiss button; `useSpotlight.test.ts` (24 tests) + `SpotlightBreadcrumb.test.tsx` (15 tests + 2 axe); 630 tests total, zero violations. OPS-574 done 2026-04-27: `InterSceneConnectors` component — `<section aria-label="Scene connections">` listing cross-scene edges as buttons (fromScene → toScene, amber ↩ back badge, italic via label); empty state "No inter-scene connections."; `onActivate(edge.from)`; `InterSceneConnectors.test.tsx` (24 tests + 4 axe); 654 tests total, zero violations. OPS-575 done 2026-04-27: `NodeDetail` component — read-only `<aside aria-label="Node detail">` with placeholder when null; header (h2 title + TypeBadge + classifier tags); Narrative section (narrativeText or "No narrative text."); Choices section (one button per choice → onActivate(nextNode), "(untitled choice)" fallback, title resolution, "No choices." empty state); footer with node id; `NodeDetail.test.tsx` (33 tests + 5 axe); 687 tests total, zero violations. OPS-576 done 2026-04-27: `CanvasView` fully rewritten — SVG canvas replaced with swimlane + sidebar layout; `div.swimlaneArea` (`role="region"`, overflow-y auto) contains preamble `<section>` (nodes with sceneId=null) and `SceneLane` × N from `groupByScene`; sidebar (280 px) contains `NodeDetail` (flex 1) + `InterSceneConnectors` (max-height 240 px); `useSpotlight` drives spotlight state — clicking any MiniNode/InterSceneConnectors/NodeDetail choice calls internal `handleNodeActivate` (activates spotlight + `setSelectedNodeId`); NodeDetail gains optional `onEdit?` prop rendered as "Edit in outline" footer button wired to `onNodeActivate` prop → App.tsx `handleCanvasNodeActivate` now switches to outline view + sets `pendingFocusId`; `CanvasView.test.tsx` updated (pure `computeLayout`/`edgePath` tests kept, component tests rewritten: swimlane layout, NodeDetail sidebar, spotlight state, 3 axe audits); 698 tests total, zero violations. OPS-578 done 2026-10-03: `sceneGraph.ts` — `buildSceneGraph` (scene groups, home parents, columns, same-group tree children, link classification) + `growUnreachableForest`; `bfsFromStarts` now also returns `parent`; `sceneGraph.test.ts` (45 tests incl. the OPS-577 diagram and fixture/classifier agreement) + 3 classifier tests; 746 tests total, 100% coverage on both files. **Run tests from `D:\` (upper-case)** — a lower-case `d:\` cwd loads vitest twice and ~40 jest-dom tests fail spuriously. OPS-579 done 2026-10-03: `treeLayout.ts` — `layoutGroup` band-style tidy tree per scene group with `LayoutMetrics`/`DEFAULT_METRICS`; `treeLayout.test.ts` (25 tests: exact positions for all six OPS-577 diagram stages, sibling-order stability, no-overlap/left-to-right/centring invariants on every fixture group, < 16 ms performance check); 771 tests total, 100% coverage.
