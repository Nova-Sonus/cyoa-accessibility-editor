import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSpotlight } from './useSpotlight'
import type { AdventureNode } from '../../types/adventure'

// ---------------------------------------------------------------------------
// Fixture
//
//   start → a → b → end
//           ↑
//           c (also points to a)
// ---------------------------------------------------------------------------

function node(
  id: string,
  ...nextNodes: string[]
): AdventureNode {
  return {
    id,
    title: `Node ${id}`,
    node_type: 'narrative',
    narrativeText: '',
    choices: nextNodes.map((n) => ({ choiceText: `go ${n}`, choiceResponseConstraint: '', nextNode: n })),
  }
}

const allNodes: AdventureNode[] = [
  node('start', 'a'),
  node('a', 'b'),
  node('b', 'end'),
  node('end'),
  node('c', 'a'),
]

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useSpotlight — initial state', () => {
  it('starts with no focus', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    expect(result.current.focusNodeId).toBeNull()
  })

  it('starts with null spotlightNodeIds', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    expect(result.current.spotlightNodeIds).toBeNull()
  })

  it('starts with an empty breadcrumb', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    expect(result.current.breadcrumb).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------

describe('useSpotlight — activate', () => {
  it('sets focusNodeId to the activated node', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    expect(result.current.focusNodeId).toBe('a')
  })

  it('appends the node to breadcrumb', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    expect(result.current.breadcrumb).toEqual(['a'])
  })

  it('includes focus node in spotlightNodeIds', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    expect(result.current.spotlightNodeIds?.has('a')).toBe(true)
  })

  it('includes one-hop children in spotlightNodeIds', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    // a → b
    expect(result.current.spotlightNodeIds?.has('b')).toBe(true)
  })

  it('includes one-hop parents in spotlightNodeIds', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    // start → a, c → a
    expect(result.current.spotlightNodeIds?.has('start')).toBe(true)
    expect(result.current.spotlightNodeIds?.has('c')).toBe(true)
  })

  it('excludes two-hop nodes from spotlightNodeIds', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    // b → end (two hops from a)
    expect(result.current.spotlightNodeIds?.has('end')).toBe(false)
  })

  it('appends a second node to breadcrumb', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    expect(result.current.breadcrumb).toEqual(['a', 'b'])
    expect(result.current.focusNodeId).toBe('b')
  })

  it('is a no-op when activating the current focus node again', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    const crumbBefore = result.current.breadcrumb
    act(() => result.current.activate('a'))
    expect(result.current.breadcrumb).toBe(crumbBefore) // same reference
  })

  it('truncates breadcrumb when activating a node already in history', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    act(() => result.current.activate('end'))
    // Now navigate back to 'a' (index 0)
    act(() => result.current.activate('a'))
    expect(result.current.breadcrumb).toEqual(['a'])
    expect(result.current.focusNodeId).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

describe('useSpotlight — clear', () => {
  it('resets focusNodeId to null', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.clear())
    expect(result.current.focusNodeId).toBeNull()
  })

  it('resets spotlightNodeIds to null', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.clear())
    expect(result.current.spotlightNodeIds).toBeNull()
  })

  it('empties the breadcrumb', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    act(() => result.current.clear())
    expect(result.current.breadcrumb).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// navigateTo
// ---------------------------------------------------------------------------

describe('useSpotlight — navigateTo', () => {
  it('truncates breadcrumb to the given index', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    act(() => result.current.activate('end'))
    act(() => result.current.navigateTo(0))
    expect(result.current.breadcrumb).toEqual(['a'])
    expect(result.current.focusNodeId).toBe('a')
  })

  it('is a no-op when navigating to the last index', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    const crumbBefore = result.current.breadcrumb
    act(() => result.current.navigateTo(1)) // already the last
    expect(result.current.breadcrumb).toBe(crumbBefore)
  })

  it('is a no-op when navigating to an index beyond the last', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    const crumbBefore = result.current.breadcrumb
    act(() => result.current.navigateTo(99))
    expect(result.current.breadcrumb).toBe(crumbBefore)
  })

  it('updates spotlightNodeIds to reflect the navigation target', () => {
    const { result } = renderHook(() => useSpotlight(allNodes))
    act(() => result.current.activate('a'))
    act(() => result.current.activate('b'))
    act(() => result.current.navigateTo(0)) // back to 'a'
    expect(result.current.spotlightNodeIds?.has('a')).toBe(true)
    expect(result.current.spotlightNodeIds?.has('b')).toBe(true) // child of a
    expect(result.current.spotlightNodeIds?.has('end')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Node with no neighbours
// ---------------------------------------------------------------------------

describe('useSpotlight — isolated node', () => {
  it('spotlightNodeIds contains only the focus node when it has no neighbours', () => {
    const isolated: AdventureNode[] = [
      node('solo'),
    ]
    const { result } = renderHook(() => useSpotlight(isolated))
    act(() => result.current.activate('solo'))
    expect(result.current.spotlightNodeIds).toEqual(new Set(['solo']))
  })
})
