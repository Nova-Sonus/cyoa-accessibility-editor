import type { FightingFantasyAdventureStoryData } from './adventure.generated'

/** The full adventure document — an ordered array of nodes conforming to CYOA_Schema.json. */
export type Adventure = FightingFantasyAdventureStoryData

/** A single story node within an adventure. */
export type AdventureNode = Adventure[number]

/** A single player choice within a node. */
export type Choice = AdventureNode['choices'][number]

/** The discriminated union of all legal node_type values. */
export type NodeType = AdventureNode['node_type']

/**
 * Node types that must have an empty choices array.
 * Enforced by the schema if/then clause and the editor UI.
 */
export const TERMINAL_NODE_TYPES: ReadonlyArray<NodeType> = [
  'end',
  'adventure_success',
]

export function isTerminalNodeType(nodeType: NodeType): boolean {
  return (TERMINAL_NODE_TYPES as ReadonlyArray<string>).includes(nodeType)
}
