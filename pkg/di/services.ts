// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  type Factory,
  type ServiceKey,
  type ServiceRegistry,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry: ServiceRegistry<ServiceKey, ServiceValue> =
  new Registry();
export const services: ServiceScope<ServiceKey, ServiceValue> = registry
  .build();

export const di: Factory<ServiceKey, ServiceValue> = factory<
  ServiceKey,
  ServiceValue
>(services);

export { di as default };
