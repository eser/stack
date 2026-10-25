// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { ServiceKey } from "./primitives.ts";
import * as services from "./services.ts";

// declare global {
//   interface SymbolConstructor {
//     metadata?: symbol;
//   }
// }

// Symbol.metadata ??= Symbol("metadata");

/**
 * Class decorator that registers the class in the default registry as a lazy
 * service. The key is `key` when given, otherwise the class name.
 *
 * @param key - The key to register the class under
 * @returns The decorator
 */
export const injectable = (
  key?: ServiceKey,
  // oxlint-disable-next-line typescript/no-explicit-any
): ((source: any, context?: ClassDecoratorContext) => void) => {
  // oxlint-disable-next-line typescript/no-explicit-any
  return (source: any, context?: ClassDecoratorContext): void => {
    if (context !== undefined && context.kind !== "class") {
      return;
    }

    const name = key ?? context?.name ?? source.name;

    if (name !== undefined && name.length > 0) {
      services.registry.setLazy(name, () => new source());
    }
  };
};

/**
 * Member decorator reserved for injecting a service into a class member. It
 * does not inject anything yet: the returned decorator does nothing.
 *
 * @param _key - The key of the service to inject
 * @returns The decorator
 */
export const inject = (
  _key: ServiceKey,
  // oxlint-disable-next-line typescript/no-explicit-any
): ((_source: any, _context?: ClassMemberDecoratorContext) => void) => {
  // oxlint-disable-next-line typescript/no-explicit-any
  return (_source: any, _context?: ClassMemberDecoratorContext): void => {
    // context.addInitializer((instance) => {
    //   instance[key] = services.get(key);
    // });
  };
};
