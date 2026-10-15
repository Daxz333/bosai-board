import type { AnyNode } from '../types'

export function inheritedFlag(n: AnyNode, nodes: Record<string, AnyNode>, flag: 'hidden' | 'locked'): boolean {
  const seen = new Set<string>()
  let current: AnyNode | undefined = n
  while (current && !seen.has(current.id)) {
    if (current[flag]) return true
    seen.add(current.id)
    current = current.parent ? nodes[current.parent] : undefined
  }
  return false
}
