import { curryFunctions } from "../fp/curry-functions.ts";

// interface definitions
// ---------------------
enum ServiceType {
  Value = "VALUE",
  ValueLazy = "VALUE_LAZY",
  Factory = "FACTORY",
}

// deno-lint-ignore no-explicit-any
type Class = { new (...args: any[]): any };

// deno-lint-ignore no-explicit-any
type ContainerItems<K = Class | symbol | string, V = any> = Map<
  K,
  [ServiceType, V | (() => V | undefined) | undefined]
>;

// deno-lint-ignore no-explicit-any
interface Container<K = Class | symbol | string, V = any> {
  items: ContainerItems<K, V>;

  get<V2 = V>(
    token: K,
    defaultValue?: V2,
  ): Promise<V2 | undefined> | V2 | undefined;
  getMany<K2 extends string | number | symbol>(
    ...tokens: K2[]
  ): Promise<Record<K2, V | undefined>> | Record<K2, V | undefined>;
  setValue(token: K, value: V): void;
  setValueLazy(token: K, value: () => V | undefined): void;
  setFactory(token: K, value: () => V | undefined): void;
}

// implementation (public)
// -----------------------
const get = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  defaultValue?: V,
): Promise<V | undefined> | V | undefined => {
  const stored = containerItems.get(token);

  if (stored === undefined) {
    return defaultValue;
  }

  if (stored[0] === ServiceType.ValueLazy) {
    const value = (stored[1] as () => V | undefined)();
    containerItems.set(token, [ServiceType.Value, value]);

    return value;
  }

  if (stored[0] === ServiceType.Factory) {
    return (stored[1] as () => V | undefined)();
  }

  return stored[1] as V;
};

const getMany = <K2 extends string | number | symbol, V>(
  containerItems: ContainerItems<K2, V>,
  ...tokens: K2[]
): Promise<Record<K2, V | undefined>> | Record<K2, V | undefined> => {
  const items = {} as Record<K2, V | undefined>;

  for (const token of tokens) {
    const stored = containerItems.get(token);

    if (stored === undefined) {
      items[token] = undefined;
      continue;
    }

    if (stored[0] === ServiceType.ValueLazy) {
      const value = (stored[1] as () => V | undefined)();
      containerItems.set(token, [ServiceType.Value, value]);

      items[token] = value;
      continue;
    }

    if (stored[0] === ServiceType.Factory) {
      items[token] = (stored[1] as () => V | undefined)();
      continue;
    }

    items[token] = stored[1] as V;
  }

  return items;
};

const setValue = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: V,
): void => {
  containerItems.set(token, [ServiceType.Value, value]);
};

const setValueLazy = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: () => V | undefined,
): void => {
  containerItems.set(token, [ServiceType.ValueLazy, value]);
};

const setFactory = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: () => V | undefined,
): void => {
  containerItems.set(token, [ServiceType.Factory, value]);
};

const container = <K = Class | symbol | string, V = any>() => {
  const map = new Map<K, V>();

  return {
    items: map,

    ...curryFunctions(
      { get, getMany, setValue, setValueLazy, setFactory },
      map,
    ),
  };
};

export {
  type Container,
  container,
  container as default,
  type ContainerItems,
  get,
  getMany,
  type ServiceType,
  setFactory,
  setValue,
  setValueLazy,
};
