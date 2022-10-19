import { type Container, container } from "./containers.ts";
import { useContainerBuilder } from "./use-container-builder.ts";

// interface definitions
// ---------------------

type Registry = Container;

// implementation (public)
// -----------------------
// this field is used to store service objects
const registry: Registry = container();

const getService = registry.get;
const getServices = registry.getMany;
const setServiceValue = registry.setValue;
const setServiceValueLazy = registry.setValueLazy;
const setServiceFactory = registry.setFactory;

const useRegistry = useContainerBuilder(registry);

export {
  type Container,
  container,
  getService,
  getServices,
  type Registry,
  registry,
  registry as default,
  setServiceFactory,
  setServiceValue,
  setServiceValueLazy,
  useRegistry,
};
