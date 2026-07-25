export interface ConstraintRecord {
  id: number
  name: string
  arity: number
  args: unknown[]
  metadata?: Record<string, unknown>
  toString (): string
}

export function createFunctor (name: string, arity: number): string {
  return `${name}/${arity}`
}

export function createConstraint (
  id: number,
  name: string,
  args: unknown[],
  metadata?: Record<string, unknown>
): ConstraintRecord {
  const record: ConstraintRecord = {
    id,
    name,
    arity: args.length,
    args: [...args]
  }

  if (metadata) {
    record.metadata = metadata
  }

  record.toString = () => {
    if (record.arity === 0) {
      return record.name
    }
    return `${record.name}(${record.args.map((arg) => String(arg)).join(',')})`
  }

  return record
}