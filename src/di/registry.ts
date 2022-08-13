import { type Container, container } from "./container.ts";

// interface definitions
// ---------------------
type Registry = Container;

// implementation (public)
// -----------------------
// this field is used to store service objects
const registry = container();

const getService = registry.get;
const setServiceValue = registry.setValue;
const setServiceFactory = registry.setFactory;

const useRegistry = function useRegistry() {
  return [
    registry.get,
    {
      get: getService,
      setValue: setServiceValue,
      setFactory: setServiceFactory,
    },
  ];
};

export {
  getService,
  registry,
  setServiceFactory,
  setServiceValue,
  useRegistry,
  useRegistry as default,
};
