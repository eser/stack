import { type Container, container } from "./containers.ts";
import { useContainerBuilder } from "./use-container-builder.ts";

// interface definitions
// ---------------------

export type Registry = Container;

// implementation (public)
// -----------------------
// this field is used to store service objects
export const registry: Registry = container();

export const getService = registry.get;
export const getServices = registry.getMany;
export const setServiceValue = registry.setValue;
export const setServiceValueLazy = registry.setValueLazy;
export const setServiceFactory = registry.setFactory;

export const useRegistry = useContainerBuilder(registry);

export { type Container, container, registry as default };
