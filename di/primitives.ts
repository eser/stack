// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import {
  type GenericClass,
  type GenericFunction,
} from "../standards/functions.ts";

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
export type ClassService = GenericClass<Value>;
export type FunctionService = GenericFunction<Value>;

export type ServiceKey = ClassService | FunctionService | symbol | string;
export type ServiceValue = ClassService | FunctionService | Value;
export type PromisableBuilder<T> = <K>(
  scope: ServiceScope<K, T>,
) => Promisable<T>;
export type ServiceDescriptor<T> = readonly [
  ServiceType,
  Promisable<T> | PromisableBuilder<T>,
]; // tuple?

export interface ServiceRegistryWritable<K = ServiceKey, V = ServiceValue> {
  set(token: K, value: Promisable<V>): ServiceRegistry<K, V>;
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

export type ServiceResolution<T> = Promisable<T | undefined>;

export interface ServiceScopeQueryable<K = ServiceKey, V = ServiceValue> {
  get<V2 = V>(token: K, defaultValue?: V2): ServiceResolution<V2>;
  getMany(...tokens: ReadonlyArray<K>): ReadonlyArray<ServiceResolution<V>>;
  invoke<T extends GenericFunction>(fn: T): ReturnType<T>;

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
