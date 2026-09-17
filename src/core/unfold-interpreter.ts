import type { RuleNode, BodyConstraint } from './ast.js'

export interface UnfoldInterpreterOptions {
  maxUnfoldings?: number
}

export class UnfoldInterpreter {
  private readonly maxUnfoldings: number

  constructor (options: UnfoldInterpreterOptions = {}) {
    this.maxUnfoldings = options.maxUnfoldings ?? 8
  }

  selectUnfolding (n: number): number {
    if (n <= 1) {
      return 0
    }

    let k = 1
    let selected = k
    while (k <= this.maxUnfoldings && k < n) {
      selected = k
      k *= 2
    }
    return selected
  }

  stepsForUnfolding (k: number): number {
    if (k <= 0) {
      return 0
    }
    return k
  }

  needsBaseCase (n: number): boolean {
    return n <= 1
  }

  getUnfoldRules (_headName: string, _arity: number): RuleNode[] {
    const rules: RuleNode[] = []

    rules.push({
      name: 'mip_base',
      kind: 'simplification',
      kept: [],
      removed: [{
        name: 'mip',
        args: [
          { type: 'literal', value: 0 },
          { type: 'variable', name: '_' }
        ]
      }],
      guard: [],
      body: []
    })

    rules.push({
      name: 'mip_one',
      kind: 'simplification',
      kept: [],
      removed: [{
        name: 'mip',
        args: [
          { type: 'literal', value: 1 },
          { type: 'variable', name: 'M' }
        ]
      }],
      guard: [],
      body: [
        {
          type: 'constraint',
          constraint: {
            name: '_unfold_trigger',
            args: [
              { type: 'variable', name: 'M' }
            ]
          }
        } as BodyConstraint
      ]
    })

    let k = this.maxUnfoldings
    while (k >= 2) {
      rules.push({
        name: `mip_${k}`,
        kind: 'simplification',
        kept: [],
        removed: [{
          name: 'mip',
          args: [
            { type: 'variable', name: 'N' },
            { type: 'variable', name: 'M' }
          ]
        }],
        guard: [
          {
            type: 'call',
            callee: 'gte',
            args: [
              { type: 'variable', name: 'N' },
              { type: 'literal', value: k }
            ]
          }
        ],
        body: [
          {
            type: 'constraint',
            constraint: {
              name: '_unfold_trigger',
              args: [
                {
                  type: 'call',
                  callee: 'mul',
                  args: [
                    { type: 'variable', name: 'M' },
                    { type: 'literal', value: k }
                  ]
                }
              ]
            }
          } as BodyConstraint,
          {
            type: 'constraint',
            constraint: {
              name: 'mip',
              args: [
                {
                  type: 'call',
                  callee: 'sub',
                  args: [
                    { type: 'variable', name: 'N' },
                    { type: 'literal', value: k }
                  ]
                },
                { type: 'variable', name: 'M' }
              ]
            }
          } as BodyConstraint
        ]
      })
      k = k / 2
    }

    rules.push({
      name: '_unfold_trigger_cleanup',
      kind: 'simplification',
      kept: [],
      removed: [{
        name: '_unfold_trigger',
        args: [{ type: 'variable', name: '_K' }]
      }],
      guard: [],
      body: [],
      priority: -1
    })

    return rules
  }
}
