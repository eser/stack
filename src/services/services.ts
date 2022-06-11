import { container, get, setFactory, setValue } from "./container.ts";
import type {
  Container,
  ContainerItemKey,
  ContainerItemValue,
} from "./container.ts";

declare global {
  // deno-lint-ignore no-var
  var services: Container;
}

const service = function service(name: ContainerItemKey): ContainerItemValue {
  const value = get(globalThis.services.items, name);

  if (value === undefined && name.constructor === Function) {
    // deno-lint-ignore ban-types
    const newValue = (name as Function)();

    setValue(globalThis.services.items, name, newValue);
    return newValue;
  }

  return value;
};

const getService = function getService(
  name: ContainerItemKey,
  defaultValue?: ContainerItemValue,
): ContainerItemValue {
  if (globalThis.services === undefined) {
    return defaultValue;
  }

  return get(globalThis.services.items, name, defaultValue);
};

const setServiceValue = function setServiceValue(
  name: ContainerItemKey,
  value: ContainerItemValue,
): void {
  if (globalThis.services === undefined) {
    globalThis.services = container();
  }

  setValue(globalThis.services.items, name, value);
};

const setServiceFactory = function setServiceFactory(
  name: ContainerItemKey,
  value: () => ContainerItemValue,
): void {
  if (globalThis.services === undefined) {
    globalThis.services = container();
  }

  setFactory(globalThis.services.items, name, value);
};

const useServices = function useServices(): [
  // deno-lint-ignore no-explicit-any
  (name: any) => any,
  {
    // deno-lint-ignore no-explicit-any
    get: (name: any, defaultValue?: any) => any;
    // deno-lint-ignore no-explicit-any
    setValue: (name: any, value: any) => void;
    // deno-lint-ignore no-explicit-any
    setFactory: (name: any, value: () => any) => void;
  },
] {
  return [
    service,
    {
      get: getService,
      setValue: setServiceValue,
      setFactory: setServiceFactory,
    },
  ];
};

export {
  getService,
  service,
  setServiceFactory,
  setServiceValue,
  useServices,
  useServices as default,
};
