// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import { type GenericFunction } from "../standards/functions.ts";
import {
  type PromisableBuilder,
  type ServiceKey,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";

export const factory = <K = ServiceKey, V = ServiceValue>(
  services: ServiceScope<K, V>,
) => {
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

  di.get = (token: K) => services.get(token);

  di.many = (...tokens: ReadonlyArray<K>) => services.getMany(...tokens);

  di.invoke = <T extends GenericFunction>(fn: T): ReturnType<T> =>
    services.invoke(fn);

  di.scope = () => services.createScope();

  di.register = (token: K, value: Promisable<V>) =>
    services.registry.set(token, value);

  di.registerLazy = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setLazy(token, value);

  di.registerScoped = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setScoped(token, value);

  di.registerTransient = (token: K, value: PromisableBuilder<V>) =>
    services.registry.setTransient(token, value);

  return di;
};
