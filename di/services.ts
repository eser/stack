// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry = new Registry();
export const services = registry.build();

export const di = factory(services);

export { di as default };
