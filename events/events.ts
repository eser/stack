// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type EventDispatcher, type Factory } from "./primitives.ts";
import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry: Registry = new Registry();
export const dispatcher: EventDispatcher = registry.build();

export const events: Factory = factory(dispatcher);

export { events as default };
