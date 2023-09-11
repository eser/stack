// interface definitions
// ---------------------
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
  topScope: ServiceScope<K, V>;
  items: Map<K, ServiceResolution<V>>;

  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2>;
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>>;

  createScope(): ServiceScope<K, V>;
}

// implementation (public)
// -----------------------
export class Registry<K = ServiceKey, V = ServiceValue>
  implements ServiceRegistry<K, V> {
  descriptors = new Map<K, ServiceDescriptor<V>>();

  set(token: K, value: Promisable<V>) {
    this.descriptors.set(token, [ServiceType.Singleton, value]);

    return this;
  }

  setLazy(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceType.Lazy, value]);

    return this;
  }

  setScoped(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceType.Scoped, value]);

    return this;
  }

  setTransient(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceType.Transient, value]);

    return this;
  }

  build() {
    return new Scope<K, V>(this as ServiceRegistry<K, V>);
  }
}

export class Scope<K = ServiceKey, V = ServiceValue>
  implements ServiceScope<K, V> {
  registry;
  topScope;
  items = new Map<K, ServiceResolution<V>>();

  constructor(
    registry: ServiceRegistry<K, V>,
    parent?: ServiceScope<K, V>,
  ) {
    this.registry = registry;
    this.topScope = parent ?? (this as ServiceScope<K, V>);
  }

  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2> {
    const descriptor = this.registry.descriptors.get(token);

    if (descriptor === undefined) {
      return defaultValue;
    }

    if (descriptor[0] === ServiceType.Singleton) {
      return descriptor[1] as Promisable<V2>;
    }

    if (
      descriptor[0] === ServiceType.Lazy || descriptor[0] === ServiceType.Scoped
    ) {
      const targetScope = (descriptor[0] === ServiceType.Scoped)
        ? this
        : this.topScope;
      const stored = targetScope.items.get(token);

      if (stored !== undefined) {
        return stored as ServiceResolution<V2>;
      }

      const value = descriptor[1] as PromisableBuilder<V>;
      const result = value(this);

      if (result instanceof Promise) {
        return result.then((resolved) => {
          targetScope.items.set(token, resolved);

          return resolved;
        });
      }

      targetScope.items.set(token, result);

      return result as ServiceResolution<V2>;
    }

    // if (descriptor[0] === ServiceType.Transient) {
    const value = descriptor[1] as PromisableBuilder<V>;
    const result = value(this);

    return result as ServiceResolution<V2>;
    // }
  }

  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>> {
    return tokens.map((token) => this.get(token));
  }

  createScope(): ServiceScope<K, V> {
    return new Scope<K, V>(this.registry, this.topScope);
  }
}
