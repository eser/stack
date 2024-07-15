// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as promises from "@eser/standards/promises";
import * as functions from "@eser/standards/functions";
import {
  type Factory,
  type PromisableBuilder,
  type ServiceKey,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";

export const factory = <K = ServiceKey, V = ServiceValue>(
  services: ServiceScope<K, V>,
): Factory<K, V> => {
  const di = (
    strings?: TemplateStringsArray,
    ...others: ReadonlyArray<string>
  ) => {
    if (strings === undefined) {
      return services;
    }

    if (strings.length === 1) {
      return services.get(strings[0] as K);
    }

    let result = strings[0];

    for (let i = 0; i < strings.length - 1; i++) {
      result += `${services.get(others[i] as K)}${strings[i + 1]}`;
    }

    return result;
  };

  di.get = <V2 = V>(token: K) => services.get<V2>(token);

  di.getMany = (...tokens: ReadonlyArray<K>) => services.getMany(...tokens);

  // deno-lint-ignore no-explicit-any
  di.invoke = <T extends functions.GenericFunction<ReturnType<T>, any>>(
    fn: T,
  ): ReturnType<T> => services.invoke(fn);

  di.createScope = () => services.createScope();

  di.set = (token: K, value: promises.Promisable<V>) =>
    services.registry.set(token, value);

  di.setLazy = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setLazy(token, value);

  di.setScoped = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setScoped(token, value);

  di.setTransient = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setTransient(token, value);

  return di;
};
