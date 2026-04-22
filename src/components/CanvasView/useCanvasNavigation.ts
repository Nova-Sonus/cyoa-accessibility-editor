import { useState, useCallback } from 'react'
import type { KeyboardEvent } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { announce } from '../../utils/announce'
import { formatCanvasAnnouncement } from '../../utils/formatCanvasAnnouncement'
import type { PositionedNode } from './useCanvasLayout'
import type { Adventure } from '../../types/adventure'

export function useCanvasNavigation(
  nodes: PositionedNode[],
  adventureDoc: Adventure,
  onNodeActivate: (nodeId: string) => void,
) {
  const storeSelectedNodeId = useAdventureStore((s) => s.selectedNodeId)
  const setStoreSelectedNodeId = useAdventureStore((s) => s.setSelectedNodeId)

  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleSelectionChange = useCallback(
    (nextIndex: number) => {
      const node = nodes[nextIndex]
      if (!node) return

      const prevId = storeSelectedNodeId
      const prevDocNode = prevId ? adventureDoc.find((n) => n.id === prevId) : undefined

      let choiceIndex: number | undefined
      let totalChoices: number | undefined
      if (prevDocNode) {
        const idx = prevDocNode.choices.findIndex((c) => c.nextNode === node.id)
        if (idx !== -1) {
          choiceIndex = idx + 1
          totalChoices = prevDocNode.choices.length
        }
      }

      setStoreSelectedNodeId(node.id)
      setSelectedIndex(nextIndex)

      announce(
        formatCanvasAnnouncement({
          title: node.title,
          nodeType: node.nodeType,
          choiceCount: node.choiceCount,
          isCheckpoint: node.tags.isCheckpoint,
          previousTitle: prevDocNode?.title,
          choiceIndex,
          totalChoices,
        }),
      )
    },
    [nodes, adventureDoc, storeSelectedNodeId, setStoreSelectedNodeId],
  )

  const handleNodeClick = useCallback(
    (nodeId: string, index: number) => {
      setSelectedIndex(index)
      onNodeActivate(nodeId)
    },
    [onNodeActivate],
  )

  const handleRegionKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const node = nodes[selectedIndex]
        if (node) onNodeActivate(node.id)
        return
      }

      let nextIndex = selectedIndex
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        nextIndex = Math.min(nodes.length - 1, selectedIndex + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        nextIndex = Math.max(0, selectedIndex - 1)
      } else if (e.key === 'Home') {
        e.preventDefault()
        nextIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        nextIndex = nodes.length - 1
      } else {
        return
      }

      if (nextIndex !== selectedIndex) {
        handleSelectionChange(nextIndex)
      }
    },
    [nodes, selectedIndex, onNodeActivate, handleSelectionChange],
  )

  return { selectedIndex, handleSelectionChange, handleNodeClick, handleRegionKeyDown }
}
