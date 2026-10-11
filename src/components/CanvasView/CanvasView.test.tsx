import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { axe } from 'jest-axe'
import { CanvasView, initialExpanded } from './CanvasView'
import { AdventureStoreProvider } from '../../store/StoreContext'
import { createAdventureStore } from '../../store/adventureStore'
import { InMemoryRepository } from '../../repository/InMemoryRepository'
import type { Adventure, AdventureNode } from '../../types/adventure'
import { getValidationErrors } from '../../validation/validator'
import { deriveIssues } from '../IssuesPanel/deriveIssues'
import { buildSceneGraph, PREAMBLE_KEY, sceneKey } from './sceneGraph'
import { layoutCanvas } from './sceneLayout'
import { routeLinks, segmentHitsBox } from './linkRouting'

// jsdom has no PointerEvent, so fireEvent.pointer* would build plain Events
// without `button` / `clientX`.  A MouseEvent subclass carries both.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventStandIn extends MouseEvent {}
  window.PointerEvent = PointerEventStandIn as unknown as typeof window.PointerEvent
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id: string, overrides: Partial<AdventureNode> = {}): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: '',
    choices: [],
    ...overrides,
  }
}

function makeChoice(nextNode: string, choiceText = 'Go there') {
  return { choiceText, choiceResponseConstraint: '', nextNode }
}

async function makeStoreWithNodes(nodes: AdventureNode[]) {
  const repo = new InMemoryRepository()
  await repo.save('test', nodes)
  const store = createAdventureStore(repo)
  await store.getState().loadAdventure('test')
  return store
}

type Store = Awaited<ReturnType<typeof makeStoreWithNodes>>

function renderCanvas(store: Store, onNodeActivate = vi.fn()) {
  return render(
    <AdventureStoreProvider store={store}>
      <CanvasView onNodeActivate={onNodeActivate} />
    </AdventureStoreProvider>,
  )
}

// start1 (opening) → scene1 (scene_start) → node1
function makeSimpleDoc() {
  return [
    makeNode('start1', { node_type: 'start', choices: [makeChoice('scene1', 'Enter')] }),
    makeNode('scene1', { node_type: 'scene_start', choices: [makeChoice('node1')] }),
    makeNode('node1', { node_type: 'narrative' }),
  ]
}

async function setup(doc = makeSimpleDoc()) {
  const store = await makeStoreWithNodes(doc)
  const onNodeActivate = vi.fn()
  const result = renderCanvas(store, onNodeActivate)
  return { ...result, store, onNodeActivate }
}

const graphRegion = () => screen.getByRole('region', { name: /Adventure graph/i })
const sceneToggle = (name: RegExp) =>
  within(screen.getByRole('region', { name })).getAllByRole('button')[0]!
const linkPaths = (container: HTMLElement) =>
  [...container.querySelectorAll('path[data-link-style]')]
const zoomLevel = () =>
  within(screen.getByRole('toolbar', { name: 'Canvas controls' })).getByText(/%$/)

// ---------------------------------------------------------------------------
// initialExpanded
// ---------------------------------------------------------------------------

describe('initialExpanded', () => {
  const graph = buildSceneGraph(makeSimpleDoc())

  it('opens the scene holding the selected node', () => {
    expect(initialExpanded(graph, 'node1')).toEqual(new Set([sceneKey('scene1')]))
  })

  it('opens the first group when nothing (or an unknown node) is selected', () => {
    expect(initialExpanded(graph, null)).toEqual(new Set([PREAMBLE_KEY]))
    expect(initialExpanded(graph, 'ghost')).toEqual(new Set([PREAMBLE_KEY]))
  })

  it('opens nothing for an adventure with no groups', () => {
    expect(initialExpanded(buildSceneGraph([]), null)).toEqual(new Set())
  })
})

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

describe('CanvasView — empty state', () => {
  it('shows "No adventure loaded" when document is empty', async () => {
    await setup([])
    expect(screen.getByText(/No adventure loaded/i)).toBeTruthy()
  })
})

describe('CanvasView — structure', () => {
  it('labels the graph region with node and connection counts', async () => {
    await setup()
    expect(graphRegion()).toHaveAccessibleName('Adventure graph: 3 nodes, 2 connections')
  })

  it('renders a labelled toolbar with the zoom level in a polite live region', async () => {
    await setup()
    expect(zoomLevel()).toHaveTextContent('100%')
    expect(zoomLevel()).toHaveAttribute('aria-live', 'polite')
    expect(zoomLevel()).toHaveAttribute('aria-atomic', 'true')
  })

  it('renders a labelled section per scene group', async () => {
    await setup()
    expect(screen.getByRole('region', { name: 'Scene: Opening' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Scene: Node scene1' })).toBeTruthy()
  })

  it('keeps the NodeDetail and Scene connections sidebar', async () => {
    await setup()
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Scene connections' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Collapsing scenes
// ---------------------------------------------------------------------------

describe('CanvasView — collapsible scenes', () => {
  it('opens the first scene and collapses the rest by default', async () => {
    await setup()
    expect(sceneToggle(/Opening/)).toHaveAttribute('aria-expanded', 'true')
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Node start1 \(start\)/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Node node1 \(narrative\)/ })).toBeNull()
  })

  it('names each scene toggle with its title and summary', async () => {
    await setup()
    expect(sceneToggle(/Node scene1/)).toHaveAccessibleName('Node scene1, 2 nodes')
  })

  it('expands and collapses a scene from its header', async () => {
    await setup()
    fireEvent.click(sceneToggle(/Node scene1/))
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Node node1 \(narrative\)/ })).toBeTruthy()
    fireEvent.click(sceneToggle(/Node scene1/))
    expect(screen.queryByRole('button', { name: /Node node1 \(narrative\)/ })).toBeNull()
  })

  it('expands and collapses every scene from the toolbar', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all scenes' }))
    expect(sceneToggle(/Opening/)).toHaveAttribute('aria-expanded', 'true')
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all scenes' }))
    expect(sceneToggle(/Opening/)).toHaveAttribute('aria-expanded', 'false')
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens the scene of a node selected elsewhere (outline / companion panel)', async () => {
    const { store } = await setup()
    act(() => store.getState().setSelectedNodeId('node1'))
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('leaves expansion alone when the selection moves within an open scene', async () => {
    const { store } = await setup()
    act(() => store.getState().setSelectedNodeId('start1'))
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'false')
    act(() => store.getState().setSelectedNodeId(null))
    expect(sceneToggle(/Opening/)).toHaveAttribute('aria-expanded', 'true')
  })

  it('starts from the default expansion when another adventure is loaded', async () => {
    const { store } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all scenes' }))
    act(() => store.getState().importAdventure(makeSimpleDoc()))
    expect(sceneToggle(/Opening/)).toHaveAttribute('aria-expanded', 'true')
  })
})

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

describe('CanvasView — links', () => {
  it('draws a link from the open scene into the collapsed one', async () => {
    const { container } = await setup()
    const paths = linkPaths(container)
    expect(paths).toHaveLength(1)
    expect(paths[0]).toHaveAttribute('data-link-style', 'scene')
    expect(paths[0]!.getAttribute('d')).toMatch(/^M /)
  })

  it('draws tree links inside an expanded scene', async () => {
    const { container } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all scenes' }))
    const styles = linkPaths(container).map((p) => p.getAttribute('data-link-style'))
    expect(styles.sort()).toEqual(['scene', 'tree'])
  })

  it('draws loop-backs in the back style', async () => {
    const { container } = await setup([
      makeNode('s', { node_type: 'start', choices: [makeChoice('a')] }),
      makeNode('a', { node_type: 'decision', choices: [makeChoice('s')] }),
    ])
    const styles = linkPaths(container).map((p) => p.getAttribute('data-link-style'))
    expect(styles.sort()).toEqual(['back', 'tree'])
  })

  it('draws forward cross-links in the cross style', async () => {
    const { container } = await setup([
      makeNode('s', { node_type: 'start', choices: [makeChoice('a'), makeChoice('b')] }),
      makeNode('a', { node_type: 'decision', choices: [makeChoice('c')] }),
      makeNode('b', { node_type: 'decision', choices: [makeChoice('c')] }),
      makeNode('c'),
    ])
    const styles = linkPaths(container).map((p) => p.getAttribute('data-link-style'))
    expect(styles).toContain('cross')
  })

  it('emphasises the spotlighted node’s links and dims the rest', async () => {
    const { container } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all scenes' }))
    fireEvent.click(screen.getByRole('button', { name: /Node node1 \(narrative\)/ }))
    const byStyle = Object.fromEntries(
      linkPaths(container).map((p) => [p.getAttribute('data-link-style'), p.getAttribute('data-emphasis')]),
    )
    expect(byStyle).toEqual({ tree: 'focus', scene: 'dimmed' })
  })

  it('makes the link layer invisible to assistive technology', async () => {
    const { container } = await setup()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})

// ---------------------------------------------------------------------------
// Spotlight, selection and the sidebar
// ---------------------------------------------------------------------------

describe('CanvasView — spotlight and sidebar', () => {
  it('spotlights and selects a node card when it is activated', async () => {
    const { store } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Node start1' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: /Spotlight trail/i })).toBeTruthy()
    expect(store.getState().selectedNodeId).toBe('start1')
  })

  it('opens a collapsed scene when a NodeDetail choice leads into it', async () => {
    const { store } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    const detail = screen.getByRole('complementary', { name: 'Node detail' })
    fireEvent.click(within(detail).getByRole('button', { name: /Enter/ }))
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'true')
    expect(store.getState().selectedNodeId).toBe('scene1')
  })

  it('opens the scene of a breadcrumb entry when navigating back to it', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all scenes' }))
    fireEvent.click(screen.getByRole('button', { name: /Node node1 \(narrative\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    fireEvent.click(sceneToggle(/Node scene1/)) // collapse node1's scene
    const trail = screen.getByRole('navigation', { name: /Spotlight trail/i })
    fireEvent.click(within(trail).getByRole('button', { name: 'Node node1' }))
    expect(sceneToggle(/Node scene1/)).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('heading', { level: 2, name: 'Node node1' })).toBeTruthy()
  })

  it('"Edit in outline" calls onNodeActivate with the spotlighted node id', async () => {
    const { onNodeActivate } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Edit in outline/i }))
    expect(onNodeActivate).toHaveBeenCalledWith('start1')
  })

  it('clears the spotlight from the breadcrumb', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    fireEvent.click(screen.getByRole('button', { name: /Clear spotlight/i }))
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
  })

  it('clears the spotlight when empty canvas is clicked', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    fireEvent.pointerDown(graphRegion(), { button: 0, clientX: 5, clientY: 5 })
    fireEvent.pointerUp(graphRegion(), { button: 0, clientX: 5, clientY: 5 })
    expect(screen.getByText(/Spotlight a node to see its details/i)).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Pan and zoom
// ---------------------------------------------------------------------------

describe('CanvasView — pan and zoom', () => {
  const world = (container: HTMLElement) =>
    graphRegion().firstElementChild as HTMLElement ?? container

  it('opens an adventure with its start node on the left, mid-viewport, once measured', async () => {
    // jsdom has no layout; give every element a 400 × 300 box for this test.
    const w = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
    const h = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
    try {
      const { container } = await setup()
      // start1's card centre is 74 px down the canvas (12 padding + 36 header + 26).
      expect(world(container).style.getPropertyValue('--pan-x')).toBe('16px')
      expect(world(container).style.getPropertyValue('--pan-y')).toBe(`${150 - 74}px`)
    } finally {
      w.mockRestore()
      h.mockRestore()
    }
  })

  it('zooms in and out from the toolbar', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoomLevel()).toHaveTextContent('120%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(zoomLevel()).toHaveTextContent('83%')
  })

  it('resets and fits the view', async () => {
    await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
    expect(zoomLevel()).toHaveTextContent('100%')
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    // jsdom reports a 0 × 0 viewport, so fitting falls back to the initial view
    fireEvent.click(screen.getByRole('button', { name: 'Fit to view' }))
    expect(zoomLevel()).toHaveTextContent('100%')
  })

  it('turns a native scroll of the viewport (focusing an off-screen card) into pan', async () => {
    const { container } = await setup()
    const region = graphRegion()
    // jsdom does not scroll; give the viewport writable scroll offsets.
    let left = 120
    let top = 30
    Object.defineProperty(region, 'scrollLeft', { get: () => left, set: (v: number) => { left = v }, configurable: true })
    Object.defineProperty(region, 'scrollTop', { get: () => top, set: (v: number) => { top = v }, configurable: true })
    act(() => {
      region.dispatchEvent(new Event('scroll'))
    })
    expect([left, top]).toEqual([0, 0])
    expect(world(container).style.getPropertyValue('--pan-x')).toBe(`${16 - 120}px`)
    expect(world(container).style.getPropertyValue('--pan-y')).toBe(`${16 - 30}px`)
    // A scroll event with nothing to absorb changes nothing.
    act(() => {
      region.dispatchEvent(new Event('scroll'))
    })
    expect(world(container).style.getPropertyValue('--pan-x')).toBe(`${16 - 120}px`)
  })

  it('zooms with the mouse wheel without scrolling the page', async () => {
    await setup()
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    act(() => {
      graphRegion().dispatchEvent(wheel)
    })
    expect(wheel.defaultPrevented).toBe(true)
    expect(zoomLevel()).toHaveTextContent('120%')
    act(() => {
      graphRegion().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }))
    })
    expect(zoomLevel()).toHaveTextContent('100%')
  })

  it('pans by dragging empty canvas without clearing the spotlight', async () => {
    const { container } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    fireEvent.pointerDown(graphRegion(), { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(graphRegion(), { clientX: 40, clientY: 30 })
    fireEvent.pointerUp(graphRegion(), { clientX: 40, clientY: 30 })
    expect(world(container).style.getPropertyValue('--pan-x')).toBe('46px')
    expect(world(container).style.getPropertyValue('--pan-y')).toBe('36px')
    expect(screen.getByRole('heading', { level: 2, name: 'Node start1' })).toBeTruthy()
  })

  it('ignores presses that start on a button, other mouse buttons and cancelled drags', async () => {
    const { container } = await setup()
    const card = screen.getByRole('button', { name: /Node start1 \(start\)/ })
    fireEvent.pointerDown(card, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(graphRegion(), { clientX: 60, clientY: 60 })
    fireEvent.pointerDown(graphRegion(), { button: 2, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(graphRegion(), { clientX: 60, clientY: 60 })
    fireEvent.pointerDown(graphRegion(), { button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerCancel(graphRegion())
    fireEvent.pointerMove(graphRegion(), { clientX: 60, clientY: 60 })
    expect(world(container).style.getPropertyValue('--pan-x')).toBe('16px')
  })
})

// ---------------------------------------------------------------------------
// Authoring from the canvas, re-layout and anchoring (OPS-583)
// ---------------------------------------------------------------------------

/** Makes the user prefer reduced motion, so re-layouts apply at once. */
function preferReducedMotion() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
}

/** Gives every element a `w` × `h` box (jsdom has no layout). */
function measureViewport(w: number, h: number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(w)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(h)
}

afterEach(() => {
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
})

const cssPx = (el: Element, name: string) => parseFloat((el as HTMLElement).style.getPropertyValue(name))

/** Screen position (zoom 100%) of the card whose accessible name starts `name`. */
function cardOnScreen(name: string) {
  const slot = screen.getByRole('button', { name: new RegExp(`^${name} \\(`) }).parentElement!
  const sceneEl = slot.closest('section')!
  const world = graphRegion().firstElementChild!
  return {
    x: cssPx(world, '--pan-x') + cssPx(sceneEl, '--x') + cssPx(slot, '--x'),
    y: cssPx(world, '--pan-y') + cssPx(sceneEl, '--y') + cssPx(slot, '--y'),
  }
}

const addChoiceButton = () => screen.queryByRole('button', { name: /^Add choice to / })

/** Every card of `doc` with all scenes expanded, and every routed link. */
function fullLayout(doc: Adventure) {
  const graph = buildSceneGraph(doc)
  const layout = layoutCanvas(graph, new Set(graph.groups.map((g) => g.key)))
  return { layout, links: routeLinks(graph, layout) }
}

describe('CanvasView — Add choice from the canvas', () => {
  it('is offered only on the spotlighted card', async () => {
    await setup()
    expect(addChoiceButton()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    expect(addChoiceButton()).toHaveAccessibleName('Add choice to Node start1')
  })

  it('is not offered on terminal nodes', async () => {
    await setup([
      makeNode('s', { node_type: 'start', choices: [makeChoice('e')] }),
      makeNode('e', { node_type: 'end' }),
    ])
    fireEvent.click(screen.getByRole('button', { name: /Node e \(end\)/ }))
    expect(addChoiceButton()).toBeNull()
  })

  it('adds a choice and its linked node in one step, then selects, spotlights and focuses it', async () => {
    const { store } = await setup([makeNode('s', { node_type: 'start' })])
    fireEvent.click(screen.getByRole('button', { name: /Node s \(start\)/ }))
    fireEvent.click(addChoiceButton()!)

    const { document, classifierCache, selectedNodeId } = store.getState()
    expect(document).toHaveLength(2)
    const newId = document[0]!.choices[0]!.nextNode
    expect(document[1]!.id).toBe(newId)
    expect(selectedNodeId).toBe(newId)
    expect(getValidationErrors(document)).toEqual([])
    expect(deriveIssues(document, classifierCache).map((i) => i.kind)).not.toContain('dangling-reference')

    expect(screen.getByRole('heading', { level: 2, name: 'New node' })).toBeTruthy()
    const newCard = screen.getByRole('button', { name: /^New node \(decision\)/ })
    expect(newCard).toHaveAttribute('data-spotlight', 'focus')
    await waitFor(() => expect(newCard).toHaveFocus())
    expect(addChoiceButton()).toHaveAccessibleName('Add choice to New node')
  })

  it('OPS-577 AC 2–3: the first new node is to the right, the second below it, all connected', async () => {
    const { store, container } = await setup([makeNode('s', { node_type: 'start' })])
    const source = () => screen.getByRole('button', { name: /Node s \(start\)/ })
    fireEvent.click(source())
    fireEvent.click(addChoiceButton()!)
    fireEvent.click(source())
    fireEvent.click(addChoiceButton()!)

    const { document } = store.getState()
    expect(getValidationErrors(document)).toEqual([])
    const [first, second] = document[0]!.choices.map((c) => c.nextNode)
    const { layout, links } = fullLayout(document)
    const s = layout.nodes.get('s')!
    const a = layout.nodes.get(first!)!
    const b = layout.nodes.get(second!)!
    expect(a.x).toBeGreaterThan(s.x + s.width)
    expect(b.x).toBe(a.x)
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height)
    expect(links.filter((l) => l.from === 's').map((l) => l.to)).toEqual([first, second])
    // Both connections are drawn on the canvas too.
    expect(linkPaths(container).filter((p) => p.getAttribute('data-link-style') === 'tree')).toHaveLength(2)
  })

  it('OPS-577 AC 4: linking to an existing node draws a connection clear of every other card', async () => {
    const { store, container } = await setup([
      makeNode('s', { node_type: 'start', choices: [makeChoice('a'), makeChoice('b'), makeChoice('c')] }),
      makeNode('a', { node_type: 'decision' }),
      makeNode('b', { node_type: 'decision' }),
      makeNode('c', { node_type: 'decision' }),
    ])
    expect(linkPaths(container)).toHaveLength(3)

    // What the CompanionPanel node picker does for a new choice.
    act(() => store.getState().addChoice('c', makeChoice('a', 'Back to a')))

    expect(linkPaths(container)).toHaveLength(4)
    const { layout, links } = fullLayout(store.getState().document)
    const link = links.find((l) => l.from === 'c' && l.to === 'a')!
    for (const [id, card] of layout.nodes) {
      if (id === 'a' || id === 'c') continue
      link.points.slice(1).forEach((p, i) => {
        expect(segmentHitsBox(link.points[i]!, p, card)).toBe(false)
      })
    }
  })
})

describe('CanvasView — viewport anchoring', () => {
  it('keeps the selected node still on screen when an edit moves it', async () => {
    preferReducedMotion()
    measureViewport(1000, 800)
    const { store } = await setup([
      makeNode('s', { node_type: 'start', choices: [makeChoice('a'), makeChoice('b')] }),
      makeNode('a', { node_type: 'decision' }),
      makeNode('b', { node_type: 'decision' }),
    ])
    fireEvent.click(screen.getByRole('button', { name: /Node b \(decision\)/ }))
    const before = cardOnScreen('Node b')

    // Two new children under a push b down the canvas.
    act(() => {
      store.getState().createNodeAndLinkChoice('a', 0)
      store.getState().createNodeAndLinkChoice('a', 1)
    })

    const { layout } = fullLayout(store.getState().document)
    expect(layout.nodes.get('b')!.y).toBeGreaterThan(fullLayout([
      makeNode('s', { node_type: 'start', choices: [makeChoice('a'), makeChoice('b')] }),
      makeNode('a'),
      makeNode('b'),
    ]).layout.nodes.get('b')!.y)
    expect(cardOnScreen('Node b')).toEqual(before)
  })

  it('pans just enough to keep a node created off-screen in view', async () => {
    preferReducedMotion()
    measureViewport(400, 300)
    await setup([makeNode('s', { node_type: 'start' })])
    fireEvent.click(screen.getByRole('button', { name: /Node s \(start\)/ }))
    fireEvent.click(addChoiceButton()!)

    const card = cardOnScreen('New node')
    expect(card.x + 160).toBe(400 - 24)
    expect(card.y).toBeGreaterThanOrEqual(24)
  })

  it('animates the new node in, then settles', async () => {
    await setup([makeNode('s', { node_type: 'start' })])
    fireEvent.click(screen.getByRole('button', { name: /Node s \(start\)/ }))
    fireEvent.click(addChoiceButton()!)
    const slot = () => screen.getByRole('button', { name: /^New node \(decision\)/ }).parentElement!
    expect(slot()).toHaveAttribute('data-entering')
    await waitFor(() => expect(slot()).not.toHaveAttribute('data-entering'))
  })
})

// ---------------------------------------------------------------------------
// Accessibility audit
// ---------------------------------------------------------------------------

describe('CanvasView — axe-core', () => {
  it('has no violations on the empty state', async () => {
    const { container } = await setup([])
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with the default expansion', async () => {
    const { container } = await setup()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations with every scene expanded and a node spotlighted', async () => {
    const { container } = await setup()
    fireEvent.click(screen.getByRole('button', { name: 'Expand all scenes' }))
    fireEvent.click(screen.getByRole('button', { name: /Node node1 \(narrative\)/ }))
    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no violations while the "Add choice" button is shown', async () => {
    const { container } = await setup()
    fireEvent.click(screen.getByRole('button', { name: /Node start1 \(start\)/ }))
    expect(addChoiceButton()).not.toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })
})
