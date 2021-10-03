import { container, get, setFactory, setValue } from "./container.ts";
import type {
  Container,
  ContainerItemKey,
  ContainerItemValue,
} from "./container.ts";

declare global {
  var services: Container;
}

function service(
  name: ContainerItemKey,
  defaultValue?: ContainerItemValue,
): ContainerItemValue {
  if (globalThis.services === undefined) {
    return defaultValue;
  }

  return get(globalThis.services.items, name, defaultValue);
}

function setServiceValue(
  name: ContainerItemKey,
  value: ContainerItemValue,
): void {
  if (globalThis.services === undefined) {
    globalThis.services = container();
  }

  setValue(globalThis.services.items, name, value);
}

function setServiceFactory(
  name: ContainerItemKey,
  value: () => ContainerItemValue,
): void {
  if (globalThis.services === undefined) {
    globalThis.services = container();
  }

  setFactory(globalThis.services.items, name, value);
}

function useServices(): [
  // deno-lint-ignore no-explicit-any
  (name: any, defaultValue?: any) => any,
  {
    // deno-lint-ignore no-explicit-any
    setValue: (name: any, value: any) => void;
    // deno-lint-ignore no-explicit-any
    setFactory: (name: any, value: () => any) => void;
  },
] {
  return [
    service, // getService
    {
      setValue: setServiceValue,
      setFactory: setServiceFactory,
    },
  ];
}

export {
  service,
  setServiceFactory,
  setServiceValue,
  useServices,
  useServices as default,
};
