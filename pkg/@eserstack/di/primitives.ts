// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * How a registered service is created and kept:
 *
 * - `Singleton`: the value given at registration.
 * - `Lazy`: built on the first `get` and kept in the root scope.
 * - `Scoped`: built once per scope and kept in that scope.
 * - `Transient`: built on every `get`.
 */
export const ServiceTypes = {
  Singleton: 0,
  Lazy: 1,
  Scoped: 2,
  Transient: 3,
} as const;

/** The name of a service type, such as `"Lazy"`. */
export type ServiceTypeKey = Exclude<keyof typeof ServiceTypes, number>;
/** The numeric value of a service type in `ServiceTypes`. */
export type ServiceType = typeof ServiceTypes[ServiceTypeKey];

/** Any service value. */
// deno-lint-ignore no-explicit-any
export type Value = any;
/** A class used as a service key. */
// deno-lint-ignore no-explicit-any
export type ClassService = new (...args: ReadonlyArray<any>) => Value;
/** A function used as a service key. */
// deno-lint-ignore no-explicit-any
export type FunctionService = (...args: ReadonlyArray<any>) => Value;

/** What a service is registered under: a class, a function, a symbol or a string. */
export type ServiceKey = ClassService | FunctionService | symbol | string;
/** A registered service value. */
export type ServiceValue = ClassService | FunctionService | Value;
/**
 * Builds a service value, or a promise of one, from the scope that asks for
 * it.
 */
export type PromisableBuilder<T> = <K>(
  scope: ServiceScope<K, T>,
) => Promise<T> | T;
/** How a service is registered: its type, and its value or builder. */
export type ServiceDescriptor<T> = readonly [
  ServiceType,
  Promise<T> | T | PromisableBuilder<T>,
];

/** Registers services under keys. Each method returns the registry. */
export interface ServiceRegistryWritable<K = ServiceKey, V = ServiceValue> {
  /** Registers a value as a singleton service. */
  set(token: K, value: Promise<V> | V): ServiceRegistry<K, V>;
  /** Registers a service built on the first `get` and kept in the root scope. */
  setLazy(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  /** Registers a service built once per scope. */
  setScoped(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  /** Registers a service built on every `get`. */
  setTransient(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
}

/** Registered services, and `build()` to create the root scope from them. */
export type ServiceRegistry<K = ServiceKey, V = ServiceValue> =
  & ServiceRegistryWritable<K, V>
  & {
    descriptors: Map<K, ServiceDescriptor<V>>;

    build(): ServiceScope<K, V>;
  };

/**
 * The result of a lookup: the value, a promise of it when its builder is
 * async, or `undefined` when nothing is registered under the key.
 */
export type ServiceResolution<T> = Promise<T | undefined> | T | undefined;

/** Resolves services by key. */
export interface ServiceScopeQueryable<K = ServiceKey, V = ServiceValue> {
  /** Resolves one service, or returns `defaultValue` when none is registered. */
  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2>;
  /** Resolves several services, in the order of the keys. */
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>>;
  /**
   * Calls `fn` with the services registered under the names of its
   * parameters, and returns its result.
   */
  // deno-lint-ignore no-explicit-any
  invoke<T extends (...args: ReadonlyArray<any>) => ReturnType<T>>(
    fn: T,
  ): ReturnType<T>;

  /** Creates a child scope that shares the root scope's lazy services. */
  createScope(): ServiceScope<K, V>;
}

/** A scope that resolves services and keeps the values it built. */
export type ServiceScope<K = ServiceKey, V = ServiceValue> =
  & ServiceScopeQueryable<K, V>
  & {
    registry: ServiceRegistry<K, V>;
    rootScope: ServiceScope<K, V>;
    items: Map<K, ServiceResolution<V>>;
  };

/**
 * The `di` function. Called with no arguments it returns the scope. As a
 * template tag, a template without placeholders resolves the service it names,
 * and a template with placeholders becomes a string with each placeholder
 * replaced by the service it names. Its methods register and resolve services
 * like the registry and the scope.
 */
export type Factory<K = ServiceKey, V = ServiceValue> =
  & ServiceScopeQueryable<K, V>
  & ServiceRegistryWritable<K, V>
  & {
    (
      strings?: TemplateStringsArray,
      ...others: ReadonlyArray<string>
    ): ServiceScope<K, V> | ServiceResolution<V> | string;
  };
