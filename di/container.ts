// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import { type GenericFunction } from "../standards/functions.ts";
import {
  type PromisableBuilder,
  type ServiceDescriptor,
  type ServiceKey,
  type ServiceRegistry,
  type ServiceResolution,
  type ServiceScope,
  ServiceTypes,
  type ServiceValue,
} from "./primitives.ts";
import { invoke } from "./invoker.ts";

export class Registry<K = ServiceKey, V = ServiceValue>
  implements ServiceRegistry<K, V> {
  descriptors = new Map<K, ServiceDescriptor<V>>();

  set(token: K, value: Promisable<V>) {
    this.descriptors.set(token, [ServiceTypes.Singleton, value]);

    return this;
  }

  setLazy(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceTypes.Lazy, value]);

    return this;
  }

  setScoped(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceTypes.Scoped, value]);

    return this;
  }

  setTransient(token: K, value: PromisableBuilder<V>) {
    this.descriptors.set(token, [ServiceTypes.Transient, value]);

    return this;
  }

  build() {
    return new Scope<K, V>(this as ServiceRegistry<K, V>);
  }
}

export class Scope<K = ServiceKey, V = ServiceValue>
  implements ServiceScope<K, V> {
  registry;
  rootScope;
  items = new Map<K, ServiceResolution<V>>();

  constructor(
    registry: ServiceRegistry<K, V>,
    parent?: ServiceScope<K, V>,
  ) {
    this.registry = registry;
    this.rootScope = parent ?? (this as ServiceScope<K, V>);
  }

  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2> {
    const descriptor = this.registry.descriptors.get(token);

    if (descriptor === undefined) {
      return defaultValue;
    }

    if (descriptor[0] === ServiceTypes.Singleton) {
      return descriptor[1] as Promisable<V2>;
    }

    if (
      descriptor[0] === ServiceTypes.Lazy ||
      descriptor[0] === ServiceTypes.Scoped
    ) {
      const targetScope = (descriptor[0] === ServiceTypes.Scoped)
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

  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>> {
    return tokens.map((token) => this.get(token));
  }

  invoke<T extends GenericFunction>(fn: T): ReturnType<T> {
    return invoke(this, fn);
  }

  createScope(): ServiceScope<K, V> {
    return new Scope<K, V>(this.registry, this.rootScope);
  }
}
