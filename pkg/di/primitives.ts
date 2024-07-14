// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as promises from "@eser/standards/promises";
import * as functions from "@eser/standards/functions";

export const ServiceTypes = {
  Singleton: 0,
  Lazy: 1,
  Scoped: 2,
  Transient: 3,
} as const;

export type ServiceTypeKey = Exclude<keyof typeof ServiceTypes, number>;
export type ServiceType = typeof ServiceTypes[ServiceTypeKey];

// deno-lint-ignore no-explicit-any
export type Value = any;
// deno-lint-ignore no-explicit-any
export type ClassService = functions.GenericClass<Value, any>;
// deno-lint-ignore no-explicit-any
export type FunctionService = functions.GenericFunction<Value, any>;

export type ServiceKey = ClassService | FunctionService | symbol | string;
export type ServiceValue = ClassService | FunctionService | Value;
export type PromisableBuilder<T> = <K>(
  scope: ServiceScope<K, T>,
) => promises.Promisable<T>;
export type ServiceDescriptor<T> = readonly [
  ServiceType,
  promises.Promisable<T> | PromisableBuilder<T>,
]; // tuple?

export interface ServiceRegistryWritable<K = ServiceKey, V = ServiceValue> {
  set(token: K, value: promises.Promisable<V>): ServiceRegistry<K, V>;
  setLazy(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  setScoped(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
  setTransient(token: K, value: PromisableBuilder<V>): ServiceRegistry<K, V>;
}

export type ServiceRegistry<K = ServiceKey, V = ServiceValue> =
  & ServiceRegistryWritable<K, V>
  & {
    descriptors: Map<K, ServiceDescriptor<V>>;

    build(): ServiceScope<K, V>;
  };

export type ServiceResolution<T> = promises.Promisable<T | undefined>;

export interface ServiceScopeQueryable<K = ServiceKey, V = ServiceValue> {
  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2>;
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>>;
  // deno-lint-ignore no-explicit-any
  invoke<T extends functions.GenericFunction<ReturnType<T>, any>>(
    fn: T,
  ): ReturnType<T>;

  createScope(): ServiceScope<K, V>;
}

export type ServiceScope<K = ServiceKey, V = ServiceValue> =
  & ServiceScopeQueryable<K, V>
  & {
    registry: ServiceRegistry<K, V>;
    rootScope: ServiceScope<K, V>;
    items: Map<K, ServiceResolution<V>>;
  };

export type Factory<K = ServiceKey, V = ServiceValue> =
  & ServiceScopeQueryable<K, V>
  & ServiceRegistryWritable<K, V>
  & {
    (
      strings?: TemplateStringsArray,
      ...others: ReadonlyArray<string>
    ): ServiceScope<K, V> | ServiceResolution<V> | string;
  };
