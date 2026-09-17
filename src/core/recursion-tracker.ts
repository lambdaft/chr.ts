export class RecursionTracker {
  private readonly depth = new Map<string, number>()

  enter (identity: string): number {
    const current = this.depth.get(identity) ?? 0
    const next = current + 1
    this.depth.set(identity, next)
    return next
  }

  exit (identity: string): number {
    const current = this.depth.get(identity) ?? 0
    const next = Math.max(0, current - 1)
    if (next === 0) {
      this.depth.delete(identity)
    } else {
      this.depth.set(identity, next)
    }
    return next
  }

  peek (identity: string): number {
    return this.depth.get(identity) ?? 0
  }

  reset (): void {
    this.depth.clear()
  }
}
