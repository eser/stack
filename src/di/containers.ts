import { curryFunctions } from "../fp/curry-functions.ts";

// interface definitions
// ---------------------
enum ServiceType {
  Singleton = "SINGLETON",
  Factory = "FACTORY",
}

type ContainerItems<K, V> = Map<K, [ServiceType, V | (() => V | undefined)]>;

// deno-lint-ignore no-explicit-any
interface Container<K = any, V = any> {
  items: ContainerItems<K, V>;

  get(token: K, defaultValue?: V): V | undefined;
  getMany<K2 extends string | number | symbol>(...tokens: K2[]): Record<K2, V>;
  setValue(token: K, value: V): void;
  setFactory(token: K, value: () => V | undefined): void;
}

// implementation (public)
// -----------------------
const get = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  defaultValue?: V,
): V | undefined => {
  const stored = containerItems.get(token);

  if (stored === undefined) {
    return defaultValue;
  }

  if (stored[0] === ServiceType.Factory) {
    return (stored[1] as () => V | undefined)();
  }

  return stored[1] as V;
};

const getMany = <K2 extends string | number | symbol, V>(
  containerItems: ContainerItems<K2, V>,
  ...tokens: K2[]
): Record<K2, V | undefined> => {
  const items = {} as Record<K2, V | undefined>;

  for (const token of tokens) {
    const stored = containerItems.get(token);

    if (stored === undefined) {
      items[token] = undefined;
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
  containerItems.set(token, [ServiceType.Singleton, value]);
};

const setFactory = <K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: () => V | undefined,
): void => {
  containerItems.set(token, [ServiceType.Factory, value]);
};

const container = <K, V>() => {
  const map = new Map<K, V>();

  return {
    items: map,

    ...curryFunctions({ get, getMany, setValue, setFactory }, map),
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
};
