import curryFunctions from "../fp/curry-functions.ts";
import type Formatter from "./formatter.ts";

function findByName(registry: Registry, name: string): Formatter | undefined {
  for (const item of registry.items) {
    if (item.names.includes(name)) {
      return item;
    }
  }

  return undefined;
}

interface Registry {
  items: Iterable<Formatter>;

  findByName(name: string): Formatter | undefined;
}

function registry(formatters: Iterable<Formatter>): Registry {
  const created: Partial<Registry> = {
    items: formatters,
  };

  Object.assign(created, curryFunctions({ findByName }, created));

  return created as Registry;
}

export { registry as default };
