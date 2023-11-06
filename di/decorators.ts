// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import { type ServiceKey } from "./primitives.ts";
import { registry } from "./services.ts";

// declare global {
//   interface SymbolConstructor {
//     metadata?: symbol;
//   }
// }

// Symbol.metadata ??= Symbol("metadata");

export const injectable = (key?: ServiceKey) => {
  // deno-lint-ignore no-explicit-any
  return (source: any, context?: ClassDecoratorContext) => {
    if (context !== undefined && context.kind !== "class") {
      return;
    }

    const name = key ?? context?.name ?? source.name;

    if (name !== undefined) {
      registry.setLazy(name, () => new source());
    }
  };
};

export const inject = (_key: ServiceKey) => {
  // deno-lint-ignore no-explicit-any
  return (_source: any, _context?: ClassMemberDecoratorContext) => {
    // context.addInitializer((instance) => {
    //   instance[key] = services.get(key);
    // });
  };
};
