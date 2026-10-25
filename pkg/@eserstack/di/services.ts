// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type {
  Factory,
  ServiceKey,
  ServiceRegistry,
  ServiceScope,
  ServiceValue,
} from "./primitives.ts";
import * as container from "./container.ts";
import * as fluentApiFactory from "./fluent-api-factory.ts";

/** The default registry of the process. */
export const registry: ServiceRegistry<ServiceKey, ServiceValue> =
  new container.Registry();
/** The root scope of the default registry. */
export const services: ServiceScope<ServiceKey, ServiceValue> =
  registry.build();

/**
 * Registers and resolves services in the default registry.
 *
 * @example
 * ```typescript
 * import * as di from "@eserstack/di";
 *
 * di.di.set("greeting", "hello");
 * const greeting = di.di`greeting`;
 * ```
 */
export const di: Factory<ServiceKey, ServiceValue> = fluentApiFactory.factory<
  ServiceKey,
  ServiceValue
>(services);
