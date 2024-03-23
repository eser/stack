// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Factory, type ServiceScope } from "./primitives.ts";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry: Registry = new Registry();
export const services: ServiceScope = registry.build();

export const di: Factory = factory(services);

export { di as default };
