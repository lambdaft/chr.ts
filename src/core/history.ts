export class PropagationHistory {
  private readonly entries = new Map<string, Set<string>>()

  add (ruleName: string, ids: number[]): void {
    const ruleEntries = this.entries.get(ruleName) ?? new Set<string>()
    ruleEntries.add(hashIds(ids))
    this.entries.set(ruleName, ruleEntries)
  }

  has (ruleName: string, ids: number[]): boolean {
    return this.entries.get(ruleName)?.has(hashIds(ids)) ?? false
  }

  notIn (ruleName: string, ids: number[]): boolean {
    return !this.has(ruleName, ids)
  }

  clear (): void {
    this.entries.clear()
  }

  snapshot (): Record<string, string[]> {
    return Object.fromEntries(
      [...this.entries.entries()].map(([ruleName, ids]) => [ruleName, [...ids].sort()])
    )
  }
}

function hashIds (ids: number[]): string {
  return [...ids].sort((left, right) => left - right).join(':')
}