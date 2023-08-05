export interface Formatter<TSource = unknown, TTarget = string> {
  names: readonly string[];

  serialize: (payload: TSource | Promise<TSource>) => Promise<TTarget>;
  deserialize?: (payload: TTarget | Promise<TTarget>) => Promise<TSource>;
}

export { type Formatter as default };
