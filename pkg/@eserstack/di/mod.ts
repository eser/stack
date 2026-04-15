// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export {
  type ClassService,
  type Factory,
  type FunctionService,
  type PromisableBuilder,
  type ServiceDescriptor,
  type ServiceKey,
  type ServiceRegistry,
  type ServiceRegistryWritable,
  type ServiceResolution,
  type ServiceScope,
  type ServiceScopeQueryable,
  type ServiceType,
  type ServiceTypeKey,
  ServiceTypes,
  type ServiceValue,
  type Value,
} from "./primitives.ts";
export { Registry, Scope } from "./container.ts";
export { default, di, registry, services } from "./services.ts";
export { inject, injectable } from "./decorators.ts";
