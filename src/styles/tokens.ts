import type { NodeType } from '../types/adventure'

export interface NodeColours {
  border: string
  bg: string
  badge: string
  text: string
}

export interface ClassifierBadge {
  label: string
  bg: string
  fg: string
  border: string
}

export const NODE_COLOURS: Record<NodeType, NodeColours> = {
  start:             { border: '#2563eb', bg: '#eff6ff', badge: '#2563eb', text: '#1e40af' },
  scene_start:       { border: '#7c3aed', bg: '#f5f3ff', badge: '#7c3aed', text: '#5b21b6' },
  decision:          { border: '#ea580c', bg: '#fff7ed', badge: '#ea580c', text: '#c2410c' },
  narrative:         { border: '#475569', bg: '#f8fafc', badge: '#475569', text: '#334155' },
  combat:            { border: '#d97706', bg: '#fffbeb', badge: '#d97706', text: '#b45309' },
  puzzle:            { border: '#0d9488', bg: '#f0fdfa', badge: '#0d9488', text: '#0f766e' },
  end:               { border: '#dc2626', bg: '#fef2f2', badge: '#dc2626', text: '#b91c1c' },
  adventure_success: { border: '#16a34a', bg: '#f0fdf4', badge: '#16a34a', text: '#15803d' },
}

export type ClassifierTagKey =
  | 'orphan'
  | 'unreachable'
  | 'junction'
  | 'branch'
  | 'linear_link'
  | 'checkpoint'

export const CLASSIFIER_BADGES: Record<ClassifierTagKey, ClassifierBadge> = {
  orphan:      { label: 'Orphan',      bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  unreachable: { label: 'Unreachable', bg: '#fef2f2', fg: '#991b1b', border: '#fecaca' },
  junction:    { label: 'Junction',    bg: '#ede9fe', fg: '#5b21b6', border: '#c4b5fd' },
  branch:      { label: 'Branch',      bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
  linear_link: { label: 'Linear',      bg: '#f1f5f9', fg: '#475569', border: '#cbd5e1' },
  checkpoint:  { label: 'Checkpoint',  bg: '#fef3c7', fg: '#b45309', border: '#fde68a' },
}
