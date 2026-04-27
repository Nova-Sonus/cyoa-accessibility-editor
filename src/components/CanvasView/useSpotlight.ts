import { useState, useCallback, useMemo } from 'react'
import type { Adventure } from '../../types/adventure'
import { getNeighbours } from './canvasUtils'

export interface SpotlightHandle {
  /** The node currently in focus. `null` when spotlight is inactive. */
  focusNodeId: string | null
  /** Focus node + its one-hop neighbours. `null` when spotlight is inactive. */
  spotlightNodeIds: ReadonlySet<string> | null
  /** Ordered history of focused node IDs (current focus is the last entry). */
  breadcrumb: readonly string[]
  /**
   * Set focus on a node. Appends to the breadcrumb, or truncates back to the
   * existing position if the node is already in the history.
   */
  activate: (nodeId: string) => void
  /** Deactivate spotlight and clear the breadcrumb. */
  clear: () => void
  /** Navigate to a prior breadcrumb entry, discarding all subsequent entries. */
  navigateTo: (index: number) => void
}

export function useSpotlight(allNodes: Adventure): SpotlightHandle {
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])

  const focusNodeId = breadcrumb.length > 0 ? breadcrumb[breadcrumb.length - 1]! : null

  const spotlightNodeIds = useMemo<ReadonlySet<string> | null>(() => {
    if (focusNodeId === null) return null
    const { all } = getNeighbours(allNodes, focusNodeId)
    return new Set([focusNodeId, ...all])
  }, [focusNodeId, allNodes])

  const activate = useCallback((nodeId: string) => {
    setBreadcrumb((prev) => {
      const existingIdx = prev.indexOf(nodeId)
      if (existingIdx >= 0) {
        if (existingIdx === prev.length - 1) return prev // already focused
        return prev.slice(0, existingIdx + 1)
      }
      return [...prev, nodeId]
    })
  }, [])

  const clear = useCallback(() => {
    setBreadcrumb([])
  }, [])

  const navigateTo = useCallback((index: number) => {
    setBreadcrumb((prev) => {
      if (index >= prev.length - 1) return prev // already at or past this point
      return prev.slice(0, index + 1)
    })
  }, [])

  return { focusNodeId, spotlightNodeIds, breadcrumb, activate, clear, navigateTo }
}
