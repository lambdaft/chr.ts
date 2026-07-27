import { Interval } from './Interval.js'
import type { Comparator } from './Interval.js'

export type Relation =
  | '<'
  | '>'
  | 'm'
  | 'mi'
  | 'o'
  | 'oi'
  | 'fi'
  | 'di'
  | 's'
  | 'si'
  | 'd'
  | 'f'
  | 'is'

export interface RelationInfo {
  readonly relation: Relation
  readonly inverse: Relation
  readonly test: <T> (t: Interval<T>, s: Interval<T>, compare: Comparator<T>) => boolean
}

export const relations: RelationInfo[] = [
  {
    relation: '<',
    inverse: '>',
    test: (t, s, compare) => compare(t.getEnd(), s.getStart()) < 0
  },
  {
    relation: 'm',
    inverse: 'mi',
    test: (t, s, compare) => compare(t.getEnd(), s.getStart()) === 0
  },
  {
    relation: 'o',
    inverse: 'oi',
    test: (t, s, compare) =>
      compare(t.getStart(), s.getStart()) < 0 &&
      compare(t.getEnd(), s.getStart()) > 0 &&
      compare(t.getEnd(), s.getEnd()) < 0
  },
  {
    relation: 'fi',
    inverse: 'f',
    test: (t, s, compare) => s.finishes(t, compare)
  },
  {
    relation: 'di',
    inverse: 'd',
    test: (t, s, compare) => s.during(t, compare)
  },
  {
    relation: 's',
    inverse: 'si',
    test: (t, s, compare) =>
      compare(t.getStart(), s.getStart()) === 0 && compare(t.getEnd(), s.getEnd()) < 0
  },
  {
    relation: 'is',
    inverse: 'is',
    test: (t, s, compare) => t.equals(s, compare)
  },
  {
    relation: 'si',
    inverse: 's',
    test: (t, s, compare) => s.starts(t, compare)
  },
  {
    relation: 'd',
    inverse: 'di',
    test: (t, s, compare) =>
      compare(t.getStart(), s.getStart()) > 0 && compare(t.getEnd(), s.getEnd()) < 0
  },
  {
    relation: 'f',
    inverse: 'fi',
    test: (t, s, compare) =>
      compare(t.getStart(), s.getStart()) > 0 && compare(t.getEnd(), s.getEnd()) === 0
  },
  {
    relation: 'oi',
    inverse: 'o',
    test: (t, s, compare) => s.overlaps(t, compare)
  },
  {
    relation: 'mi',
    inverse: 'm',
    test: (t, s, compare) => s.meets(t, compare)
  },
  {
    relation: '>',
    inverse: '<',
    test: (t, s, compare) => compare(s.getEnd(), t.getStart()) < 0
  }
]

export const relationSets = {
  dur: new Set<Relation>(['s', 'd', 'f']),
  con: new Set<Relation>(['fi', 'di', 'si']),
  concur: new Set<Relation>(['o', 'fi', 'di', 's', 'is', 'si', 'd', 'f', 'oi']),
  full: new Set<Relation>(['<', 'm', 'o', 'fi', 'di', 's', 'is', 'si', 'd', 'f', 'oi', 'mi', '>'])
}

function key (a: Relation, b: Relation): string {
  return `${a},${b}`
}

export const transitivityTable: ReadonlyMap<string, Set<Relation>> = new Map([
  [key('<', '<'), new Set<Relation>(['<'])],
  [key('<', '>'), relationSets.full],
  [key('<', 'd'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('<', 'di'), new Set<Relation>(['<'])],
  [key('<', 'o'), new Set<Relation>(['<'])],
  [key('<', 'oi'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('<', 'm'), new Set<Relation>(['<'])],
  [key('<', 'mi'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('<', 's'), new Set<Relation>(['<'])],
  [key('<', 'si'), new Set<Relation>(['<'])],
  [key('<', 'f'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('<', 'fi'), new Set<Relation>(['<'])],
  [key('<', 'is'), new Set<Relation>(['<'])],
  [key('>', '<'), relationSets.full],
  [key('>', '>'), new Set<Relation>(['>'])],
  [key('>', 'd'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('>', 'di'), new Set<Relation>(['>'])],
  [key('>', 'o'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('>', 'oi'), new Set<Relation>(['>'])],
  [key('>', 'm'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('>', 'mi'), new Set<Relation>(['>'])],
  [key('>', 's'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('>', 'si'), new Set<Relation>(['>'])],
  [key('>', 'f'), new Set<Relation>(['>'])],
  [key('>', 'fi'), new Set<Relation>(['>'])],
  [key('>', 'is'), new Set<Relation>(['>'])],
  [key('d', '<'), new Set<Relation>(['<'])],
  [key('d', '>'), new Set<Relation>(['>'])],
  [key('d', 'd'), new Set<Relation>(['d'])],
  [key('d', 'di'), relationSets.full],
  [key('d', 'o'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('d', 'oi'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('d', 'm'), new Set<Relation>(['<'])],
  [key('d', 'mi'), new Set<Relation>(['>'])],
  [key('d', 's'), new Set<Relation>(['d'])],
  [key('d', 'si'), new Set<Relation>(['>', 'oi', 'mi', 'd', 'f'])],
  [key('d', 'f'), new Set<Relation>(['d'])],
  [key('d', 'fi'), new Set<Relation>(['<', 'o', 'm', 'd', 's'])],
  [key('d', 'is'), new Set<Relation>(['d'])],
  [key('di', '<'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('di', '>'), new Set<Relation>(['>', 'oi', 'di', 'mi', 'si'])],
  [key('di', 'd'), relationSets.concur],
  [key('di', 'di'), new Set<Relation>(['di'])],
  [key('di', 'o'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('di', 'oi'), new Set<Relation>(['oi', 'di', 'si'])],
  [key('di', 'm'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('di', 'mi'), new Set<Relation>(['oi', 'di', 'si'])],
  [key('di', 's'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('di', 'si'), new Set<Relation>(['di'])],
  [key('di', 'f'), new Set<Relation>(['di', 'si', 'oi'])],
  [key('di', 'fi'), new Set<Relation>(['di'])],
  [key('di', 'is'), new Set<Relation>(['di'])],
  [key('o', '<'), new Set<Relation>(['<'])],
  [key('o', '>'), new Set<Relation>(['>', 'oi', 'di', 'mi', 'si'])],
  [key('o', 'd'), new Set<Relation>(['o', 'd', 's'])],
  [key('o', 'di'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('o', 'o'), new Set<Relation>(['<', 'o', 'm'])],
  [key('o', 'oi'), relationSets.concur],
  [key('o', 'm'), new Set<Relation>(['<'])],
  [key('o', 'mi'), new Set<Relation>(['oi', 'di', 'si'])],
  [key('o', 's'), new Set<Relation>(['o'])],
  [key('o', 'si'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('o', 'f'), new Set<Relation>(['d', 's', 'o'])],
  [key('o', 'fi'), new Set<Relation>(['<', 'o', 'm'])],
  [key('o', 'is'), new Set<Relation>(['o'])],
  [key('oi', '<'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('oi', '>'), new Set<Relation>(['>'])],
  [key('oi', 'd'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('oi', 'di'), new Set<Relation>(['>', 'oi', 'di', 'mi', 'si'])],
  [key('oi', 'o'), relationSets.concur],
  [key('oi', 'oi'), new Set<Relation>(['>', 'oi', 'mi'])],
  [key('oi', 'm'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('oi', 'mi'), new Set<Relation>(['>'])],
  [key('oi', 's'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('oi', 'si'), new Set<Relation>(['oi', '>', 'mi'])],
  [key('oi', 'f'), new Set<Relation>(['oi'])],
  [key('oi', 'fi'), new Set<Relation>(['oi', 'di', 'si'])],
  [key('oi', 'is'), new Set<Relation>(['oi'])],
  [key('m', '<'), new Set<Relation>(['<'])],
  [key('m', '>'), new Set<Relation>(['>', 'oi', 'di', 'mi', 'si'])],
  [key('m', 'd'), new Set<Relation>(['o', 'd', 's'])],
  [key('m', 'di'), new Set<Relation>(['<'])],
  [key('m', 'o'), new Set<Relation>(['<'])],
  [key('m', 'oi'), new Set<Relation>(['o', 'd', 's'])],
  [key('m', 'm'), new Set<Relation>(['<'])],
  [key('m', 'mi'), new Set<Relation>(['f', 'fi', 'is'])],
  [key('m', 's'), new Set<Relation>(['m'])],
  [key('m', 'si'), new Set<Relation>(['m'])],
  [key('m', 'f'), new Set<Relation>(['d', 's', 'o'])],
  [key('m', 'fi'), new Set<Relation>(['<'])],
  [key('m', 'is'), new Set<Relation>(['m'])],
  [key('mi', '<'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('mi', '>'), new Set<Relation>(['>'])],
  [key('mi', 'd'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('mi', 'di'), new Set<Relation>(['>'])],
  [key('mi', 'o'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('mi', 'oi'), new Set<Relation>(['>'])],
  [key('mi', 'm'), new Set<Relation>(['s', 'si', 'is'])],
  [key('mi', 'mi'), new Set<Relation>(['>'])],
  [key('mi', 's'), new Set<Relation>(['d', 'f', 'oi'])],
  [key('mi', 'si'), new Set<Relation>(['>'])],
  [key('mi', 'f'), new Set<Relation>(['mi'])],
  [key('mi', 'fi'), new Set<Relation>(['mi'])],
  [key('mi', 'is'), new Set<Relation>(['mi'])],
  [key('s', '<'), new Set<Relation>(['<'])],
  [key('s', '>'), new Set<Relation>(['>'])],
  [key('s', 'd'), new Set<Relation>(['d'])],
  [key('s', 'di'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('s', 'o'), new Set<Relation>(['<', 'o', 'm'])],
  [key('s', 'oi'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('s', 'm'), new Set<Relation>(['<'])],
  [key('s', 'mi'), new Set<Relation>(['mi'])],
  [key('s', 's'), new Set<Relation>(['s'])],
  [key('s', 'si'), new Set<Relation>(['s', 'si', 'is'])],
  [key('s', 'f'), new Set<Relation>(['d'])],
  [key('s', 'fi'), new Set<Relation>(['<', 'm', 'o'])],
  [key('s', 'is'), new Set<Relation>(['s'])],
  [key('si', '<'), new Set<Relation>(['<', 'o', 'm', 'di', 'fi'])],
  [key('si', '>'), new Set<Relation>(['>'])],
  [key('si', 'd'), new Set<Relation>(['oi', 'd', 'f'])],
  [key('si', 'di'), new Set<Relation>(['di'])],
  [key('si', 'o'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('si', 'oi'), new Set<Relation>(['oi'])],
  [key('si', 'm'), new Set<Relation>(['o', 'di', 'fi'])],
  [key('si', 'mi'), new Set<Relation>(['mi'])],
  [key('si', 's'), new Set<Relation>(['s', 'si', 'is'])],
  [key('si', 'si'), new Set<Relation>(['si'])],
  [key('si', 'f'), new Set<Relation>(['oi'])],
  [key('si', 'fi'), new Set<Relation>(['di'])],
  [key('si', 'is'), new Set<Relation>(['si'])],
  [key('f', '<'), new Set<Relation>(['<'])],
  [key('f', '>'), new Set<Relation>(['>'])],
  [key('f', 'd'), new Set<Relation>(['d'])],
  [key('f', 'di'), new Set<Relation>(['>', 'oi', 'mi', 'di', 'si'])],
  [key('f', 'o'), new Set<Relation>(['o', 'd', 's'])],
  [key('f', 'oi'), new Set<Relation>(['>', 'oi', 'mi'])],
  [key('f', 'm'), new Set<Relation>(['m'])],
  [key('f', 'mi'), new Set<Relation>(['>'])],
  [key('f', 's'), new Set<Relation>(['d'])],
  [key('f', 'si'), new Set<Relation>(['>', 'oi', 'mi'])],
  [key('f', 'f'), new Set<Relation>(['f'])],
  [key('f', 'fi'), new Set<Relation>(['f', 'fi', 'is'])],
  [key('f', 'is'), new Set<Relation>(['f'])],
  [key('fi', '<'), new Set<Relation>(['<'])],
  [key('fi', '>'), new Set<Relation>(['>', 'oi', 'mi', 'di', 'si'])],
  [key('fi', 'd'), new Set<Relation>(['o', 'd', 's'])],
  [key('fi', 'di'), new Set<Relation>(['di'])],
  [key('fi', 'o'), new Set<Relation>(['o'])],
  [key('fi', 'oi'), new Set<Relation>(['oi', 'di', 'si'])],
  [key('fi', 'm'), new Set<Relation>(['m'])],
  [key('fi', 'mi'), new Set<Relation>(['si', 'oi', 'di'])],
  [key('fi', 's'), new Set<Relation>(['o'])],
  [key('fi', 'si'), new Set<Relation>(['di'])],
  [key('fi', 'f'), new Set<Relation>(['f', 'fi', 'is'])],
  [key('fi', 'fi'), new Set<Relation>(['fi'])],
  [key('fi', 'is'), new Set<Relation>(['fi'])],
  [key('is', '<'), new Set<Relation>(['<'])],
  [key('is', '>'), new Set<Relation>(['>'])],
  [key('is', 'd'), new Set<Relation>(['d'])],
  [key('is', 'di'), new Set<Relation>(['di'])],
  [key('is', 'o'), new Set<Relation>(['o'])],
  [key('is', 'oi'), new Set<Relation>(['oi'])],
  [key('is', 'm'), new Set<Relation>(['m'])],
  [key('is', 'mi'), new Set<Relation>(['mi'])],
  [key('is', 's'), new Set<Relation>(['s'])],
  [key('is', 'si'), new Set<Relation>(['si'])],
  [key('is', 'f'), new Set<Relation>(['f'])],
  [key('is', 'fi'), new Set<Relation>(['fi'])],
  [key('is', 'is'), new Set<Relation>(['is'])]
])

export function constraints (r1: Set<Relation>, r2: Set<Relation>): Set<Relation> {
  const result = new Set<Relation>()
  for (const elem of r1) {
    for (const elem2 of r2) {
      const value = transitivityTable.get(key(elem, elem2))
      if (value) {
        for (const rel of value) {
          result.add(rel)
        }
      }
    }
  }
  return result
}

export function findRelation<T> (t: Interval<T>, s: Interval<T>, compare: Comparator<T>): Relation {
  for (const info of relations) {
    if (info.test(t, s, compare)) {
      return info.relation
    }
  }
  throw new Error('No Allen relation found for the given intervals')
}

export function defaultNumberComparator (a: number, b: number): number {
  return a - b
}
