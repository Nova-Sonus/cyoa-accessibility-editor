import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAdventureStore } from '../../store/StoreContext'
import { deriveAssetManifest } from '../AssetManifest'
import type { NodeOption } from './NodeComboField'

export function useNodeEditor() {
  const selectedNodeId = useAdventureStore((s) => s.selectedNodeId)
  const document = useAdventureStore((s) => s.document)
  const classifierCache = useAdventureStore((s) => s.classifierCache)
  const updateNode = useAdventureStore((s) => s.updateNode)
  const createNodeAndLinkChoice = useAdventureStore((s) => s.createNodeAndLinkChoice)
  const addChoice = useAdventureStore((s) => s.addChoice)
  const updateChoice = useAdventureStore((s) => s.updateChoice)
  const deleteChoice = useAdventureStore((s) => s.deleteChoice)
  const deleteNode = useAdventureStore((s) => s.deleteNode)

  const node = useMemo(
    () => (selectedNodeId != null ? (document.find((n) => n.id === selectedNodeId) ?? null) : null),
    [selectedNodeId, document],
  )
  const tags = useMemo(
    () => (selectedNodeId != null ? (classifierCache.get(selectedNodeId) ?? null) : null),
    [selectedNodeId, classifierCache],
  )
  const allNodes = useMemo<NodeOption[]>(
    () => document.map((n) => ({ id: n.id, title: n.title, node_type: n.node_type })),
    [document],
  )
  const audioSuggestions = useMemo(
    () => deriveAssetManifest(document).map((e) => e.filename),
    [document],
  )

  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    setDeleteConfirm(false)
  }, [selectedNodeId])

  const handleAddChoice = useCallback(() => {
    if (node == null) return
    addChoice(node.id, { choiceText: '', choiceResponseConstraint: '', nextNode: '' })
  }, [node, addChoice])

  const handleCreateAndLink = useCallback((choiceIndex: number) => {
    if (node == null) return
    createNodeAndLinkChoice(node.id, choiceIndex)
  }, [node, createNodeAndLinkChoice])

  const handleDeleteNode = useCallback(() => {
    if (node == null) return
    deleteNode(node.id)
  }, [node, deleteNode])

  return {
    node,
    tags,
    allNodes,
    audioSuggestions,
    updateNode,
    updateChoice,
    deleteChoice,
    deleteConfirm,
    setDeleteConfirm,
    handleAddChoice,
    handleCreateAndLink,
    handleDeleteNode,
  }
}
