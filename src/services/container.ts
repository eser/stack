import curryFunctions from "../fp/curry-functions.ts";

enum ServiceType {
  Singleton = "SINGLETON",
  Factory = "FACTORY",
}

// deno-lint-ignore no-explicit-any
type ContainerItemKey = any;
// deno-lint-ignore no-explicit-any
type ContainerItemValue = any;
type ContainerItems = Map<ContainerItemKey, [ServiceType, ContainerItemValue]>;

interface Container {
  items: ContainerItems;

  get(
    name: ContainerItemKey,
    defaultValue?: ContainerItemValue,
  ): ContainerItemValue;
  setValue(name: ContainerItemKey, value: ContainerItemValue): void;
  setFactory(name: ContainerItemKey, value: ContainerItemValue): void;
}

const get = function get(
  containerItems: ContainerItems,
  name: ContainerItemKey,
  defaultValue?: ContainerItemValue,
): ContainerItemValue {
  const stored = containerItems.get(name);

  if (stored === undefined) {
    return defaultValue;
  }

  if (stored[0] === ServiceType.Factory) {
    return (stored[1] as () => ContainerItemValue)();
  }

  return stored[1];
};

const setValue = function setValue(
  containerItems: ContainerItems,
  name: ContainerItemKey,
  value: ContainerItemValue,
): void {
  containerItems.set(name, [ServiceType.Singleton, value]);
};

const setFactory = function setFactory(
  containerItems: ContainerItems,
  name: ContainerItemKey,
  value: () => ContainerItemValue,
): void {
  containerItems.set(name, [ServiceType.Factory, value]);
};

const container = function container(): Container {
  const created: Partial<Container> = {
    items: new Map(),
  };

  Object.assign(
    created,
    curryFunctions({ get, setValue, setFactory }, created.items),
  );

  return created as Container;
};

export { container, container as default, get, setFactory, setValue };
export type {
  Container,
  ContainerItemKey,
  ContainerItems,
  ContainerItemValue,
  ServiceType,
};
