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
  setValue(token: K, value: V): void;
  setFactory(token: K, value: () => V | undefined): void;
}

// implementation (public)
// -----------------------
const get = function get<K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  defaultValue?: V,
): V | undefined {
  const stored = containerItems.get(token);

  if (stored === undefined) {
    return defaultValue;
  }

  if (stored[0] === ServiceType.Factory) {
    return (stored[1] as () => V | undefined)();
  }

  return stored[1] as V;
};

const setValue = function setValue<K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: V,
): void {
  containerItems.set(token, [ServiceType.Singleton, value]);
};

const setFactory = function setFactory<K, V>(
  containerItems: ContainerItems<K, V>,
  token: K,
  value: () => V | undefined,
): void {
  containerItems.set(token, [ServiceType.Factory, value]);
};

const container = function container<K, V>() {
  const map = new Map<K, V>();

  return {
    items: map,

    ...curryFunctions({ get, setValue, setFactory }, map),
  };
};

export {
  type Container,
  container,
  container as default,
  type ContainerItems,
  get,
  type ServiceType,
  setFactory,
  setValue,
};
