import { curryFunctions } from "../../fp/curry-functions.ts";
import { type Formatter } from "./formatter.ts";

//
// This registry can be used in two ways:
//
// Functional way:
//   import { applicationJsonFormatter } from "./application-json.ts";
//   import { findByName } from "./registry.ts";
//
//   const formatters = [ applicationJsonFormatter ];
//   const jsonFormatter = findByName(formatters, "json");
//
//
// Or, object-oriented way:
//   import { applicationJsonFormatter } from "./application-json.ts";
//   import { registry } from "./registry.ts";
//
//   const formatterRegistry = registry([ applicationJsonFormatter ]);
//   const jsonFormatter = registry.findByName("json");
//

export const findByName = (
  formatters: Iterable<Formatter>,
  name: string,
): Formatter | undefined => {
  for (const formatter of formatters) {
    if (formatter.names.includes(name)) {
      return formatter;
    }
  }

  return undefined;
};

export interface Registry {
  items: Iterable<Formatter>;

  findByName(name: string): Formatter | undefined;
}

export const registry = (formatters: Iterable<Formatter>): Registry => {
  const created: Partial<Registry> = {
    items: formatters,
  };

  Object.assign(created, curryFunctions({ findByName }, created.items));

  return created as Registry;
};

export { registry as default };
