import { type Container, container } from "./containers.ts";
import { useContainerBuilder } from "./use-container-builder.ts";

// interface definitions
// ---------------------
// deno-lint-ignore no-explicit-any
type Class = { new (...args: any[]): any };

// deno-lint-ignore no-explicit-any
type Registry = Container<Class | symbol | string, any>;

// implementation (public)
// -----------------------
// this field is used to store service objects
// deno-lint-ignore no-explicit-any
const registry: Registry = container<Class | symbol | string, any>();

const getService = registry.get;
const getServices = registry.getMany;
const setServiceValue = registry.setValue;
const setServiceValueLazy = registry.setValueLazy;
const setServiceFactory = registry.setFactory;

const useRegistry = useContainerBuilder(registry);

export {
  type Container,
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
