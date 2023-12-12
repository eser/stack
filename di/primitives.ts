// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import {
  type AnonymousClass,
  type AnonymousFunction,
} from "../standards/functions.ts";

export enum ServiceType {
  Singleton = 0,
  Lazy = 1,
  Scoped = 2,
  Transient = 3,
}

// deno-lint-ignore no-explicit-any
export type Value = any;
export type ClassService = AnonymousClass<Value>;
export type FunctionService = AnonymousFunction<Value>;

export type ServiceKey = ClassService | FunctionService | symbol | string;
export type ServiceValue = ClassService | FunctionService | Value;
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
  invoke<T extends AnonymousFunction>(fn: T): ReturnType<T>;

  createScope(): ServiceScope<K, V>;
}
