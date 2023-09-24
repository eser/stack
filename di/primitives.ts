export enum ServiceType {
  Singleton = 0,
  Lazy = 1,
  Scoped = 2,
  Transient = 3,
}

// deno-lint-ignore no-explicit-any
export type Value = any;
// deno-lint-ignore no-explicit-any
export type ClassService = new (...args: any[]) => Value;
// deno-lint-ignore no-explicit-any
export type FunctionService = (...args: any[]) => Value;

export type ServiceKey = ClassService | FunctionService | symbol | string;
export type ServiceValue = ClassService | FunctionService | Value;
export type Promisable<T> = PromiseLike<T> | T;
export type PromisableBuilder<T> = <K>(
  scope: ServiceScope<K, T>,
) => Promisable<T>;
export type ServiceDescriptor<T> = readonly [
  ServiceType,
  Promisable<T> | PromisableBuilder<T>,
]; // tuple?

export interface ServiceRegistry<K = ServiceKey, V = ServiceValue> {
  descriptors: Map<K, ServiceDescriptor<V>>;

  set(token: K, value: Promisable<V>): ServiceRegistry<K, V>;
  setLazy(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  setScoped(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  setTransient(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;

  build(): ServiceScope<K, V>;
}

export type ServiceResolution<T> = Promisable<T | undefined>;

export interface ServiceScope<K = ServiceKey, V = ServiceValue> {
  registry: ServiceRegistry<K, V>;
  rootScope: ServiceScope<K, V>;
  items: Map<K, ServiceResolution<V>>;

  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2>;
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>>;
  // deno-lint-ignore no-explicit-any
  invoke<T extends (...args: any) => any>(fn: T): ReturnType<T>;

  createScope(): ServiceScope<K, V>;
}
