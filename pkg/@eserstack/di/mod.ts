// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dependency injection: a registry of singleton, lazy, scoped and transient
 * services, scopes that resolve them, and the `di` template tag for the
 * process-wide registry.
 *
 * @example
 * ```typescript
 * import * as di from "@eserstack/di";
 *
 * di.registry.set("greeting", "hello");
 * const greeting = di.di`greeting`; // "hello"
 * ```
 *
 * @module
 */

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
export { di, registry, services } from "./services.ts";
export { inject, injectable } from "./decorators.ts";
