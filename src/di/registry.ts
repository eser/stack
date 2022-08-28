import { type Container, container } from "./container.ts";
import { useContainerBuilder } from "./use-container-builder.ts";

// interface definitions
// ---------------------
// deno-lint-ignore no-explicit-any
type Registry = Container<string, any>;

// implementation (public)
// -----------------------
// this field is used to store service objects
// deno-lint-ignore no-explicit-any
const registry: Registry = container<string, any>();

const getService = registry.get;
const setServiceValue = registry.setValue;
const setServiceFactory = registry.setFactory;

const useRegistry = useContainerBuilder(registry);

export {
  getService,
  type Registry,
  registry,
  registry as default,
  setServiceFactory,
  setServiceValue,
  useRegistry,
};
