// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";
import type {
  PromisableBuilder,
  ServiceDescriptor,
  ServiceKey,
  ServiceRegistry,
  ServiceResolution,
  ServiceScope,
  ServiceValue,
} from "./primitives.ts";
import * as invoker from "./invoker.ts";

/** Holds service registrations; `build()` creates the root scope. */
export class Registry<
  K = ServiceKey,
  V = ServiceValue,
> implements ServiceRegistry<K, V> {
  /** Each registration by key: its service type and its value or builder. */
  descriptors: Map<K, ServiceDescriptor<V>> = new Map<
    K,
    ServiceDescriptor<V>
  >();

  /** Registers a value as a singleton service. */
  set(token: K, value: Promise<V> | V): this {
    this.descriptors.set(token, [primitives.ServiceTypes.Singleton, value]);

    return this;
  }

  /** Registers a service built on the first `get` and kept in the root scope. */
  setLazy(token: K, value: PromisableBuilder<V>): this {
    this.descriptors.set(token, [primitives.ServiceTypes.Lazy, value]);

    return this;
  }

  /** Registers a service built once per scope. */
  setScoped(token: K, value: PromisableBuilder<V>): this {
    this.descriptors.set(token, [primitives.ServiceTypes.Scoped, value]);

    return this;
  }

  /** Registers a service built on every `get`. */
  setTransient(token: K, value: PromisableBuilder<V>): this {
    this.descriptors.set(token, [primitives.ServiceTypes.Transient, value]);

    return this;
  }

  /** Creates the root scope for the registered services. */
  build(): ServiceScope<K, V> {
    return new Scope<K, V>(this as ServiceRegistry<K, V>);
  }
}

/**
 * Resolves services from a registry. The root scope keeps lazy services, and
 * each scope keeps its own scoped services.
 */
export class Scope<K = ServiceKey, V = ServiceValue> implements ServiceScope<
  K,
  V
> {
  /** The registrations this scope resolves. */
  readonly registry: ServiceRegistry<K, V>;
  /** The scope that keeps lazy services; itself for the root scope. */
  readonly rootScope: ServiceScope<K, V>;
  /** The lazy or scoped values this scope has built, by key. */
  readonly items: Map<K, ServiceResolution<V>>;

  /**
   * Creates a scope.
   *
   * @param registry - The registrations to resolve
   * @param parent - The root scope; absent when this is the root scope
   */
  constructor(registry: ServiceRegistry<K, V>, parent?: ServiceScope<K, V>) {
    this.registry = registry;
    this.rootScope = parent ?? this;
    this.items = new Map<K, ServiceResolution<V>>();
  }

  /** Resolves one service, or returns `defaultValue` when none is registered. */
  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2> {
    const descriptor = this.registry.descriptors.get(token);

    if (descriptor === undefined) {
      return defaultValue;
    }

    if (descriptor[0] === primitives.ServiceTypes.Singleton) {
      return descriptor[1] as Promise<V2> | V2;
    }

    if (
      descriptor[0] === primitives.ServiceTypes.Lazy ||
      descriptor[0] === primitives.ServiceTypes.Scoped
    ) {
      const targetScope =
        descriptor[0] === primitives.ServiceTypes.Scoped
          ? this
          : this.rootScope;
      const stored = targetScope.items.get(token);

      if (stored !== undefined) {
        return stored as ServiceResolution<V2>;
      }

      const value = descriptor[1] as PromisableBuilder<V>;
      const result = value(this);

      if (result instanceof Promise) {
        return result.then((resolved) => {
          targetScope.items.set(token, resolved);

          return resolved as ServiceResolution<V2>;
        });
      }

      targetScope.items.set(token, result);

      return result as ServiceResolution<V2>;
    }

    // if (descriptor[0] === ServiceTypes.Transient) {
    const value = descriptor[1] as PromisableBuilder<V>;
    const result = value(this);

    return result as ServiceResolution<V2>;
    // }
  }

  /** Resolves several services, in the order of the keys. */
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>> {
    return tokens.map((token) => this.get(token));
  }

  /**
   * Calls `fn` with the services registered under the names of its
   * parameters, and returns its result.
   */
  // deno-lint-ignore no-explicit-any
  invoke<T extends (...args: ReadonlyArray<any>) => ReturnType<T>>(
    fn: T,
  ): ReturnType<T> {
    return invoker.invoke(this, fn);
  }

  /** Creates a child scope that shares this scope's root. */
  createScope(): ServiceScope<K, V> {
    return new Scope<K, V>(this.registry, this.rootScope);
  }
}
