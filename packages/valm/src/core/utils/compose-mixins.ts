import { Constructor } from '../configuration/mixins/base.mixin'

export type Mixin<TBase extends Constructor, TResult extends Constructor> = (base: TBase) => TResult

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never

export function composeMixins<TBase extends Constructor, TMixins extends Array<Mixin<any, any>>>(
  Base: TBase,
  ...mixins: TMixins
): Constructor<InstanceType<TBase> & UnionToIntersection<InstanceType<ReturnType<TMixins[number]>>>> {
  return mixins.reduce((acc, mixin) => mixin(acc), Base) as any
}
