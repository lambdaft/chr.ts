export class Substitution {
  private readonly map = new Map<string, unknown>()

  get (name: string): unknown | undefined {
    return this.map.get(name)
  }

  set (name: string, value: unknown): void {
    this.map.set(name, value)
  }

  has (name: string): boolean {
    return this.map.has(name)
  }

  clone (): Substitution {
    const copy = new Substitution()
    for (const [k, v] of this.map) {
      copy.map.set(k, v)
    }
    return copy
  }

  isEmpty (): boolean {
    return this.map.size === 0
  }

  entries (): Array<[string, unknown]> {
    return [...this.map.entries()]
  }

  toString (): string {
    return [...this.map.entries()]
      .map(([k, v]) => `${k} => ${JSON.stringify(v)}`)
      .join(', ')
  }
}
