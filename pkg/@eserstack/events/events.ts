// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { EventDispatcher, Factory } from "./primitives.ts";
import * as container from "./container.ts";
import * as fluentApiFactory from "./fluent-api-factory.ts";

/** The process-wide registry, shared by every importer of this package. */
export const registry: container.Registry = new container.Registry();

/** The dispatcher for the process-wide `registry`. */
export const dispatcher: EventDispatcher = registry.build();

/**
 * The tagged-template API for the process-wide registry. ``events`type` ``
 * returns a function that dispatches `type`, `events()` returns the
 * dispatcher, and `events.add` and `events.remove` manage listeners.
 *
 * @example
 * ```typescript
 * import * as events from "@eserstack/events";
 *
 * events.events.add("cache:cleared", () => {});
 *
 * const dispatchCleared = events.events`cache:cleared` as (
 *   init?: CustomEventInit<{ entries: number }>,
 * ) => boolean;
 * dispatchCleared({ detail: { entries: 12 } });
 * ```
 */
export const events: Factory = fluentApiFactory.factory(dispatcher);
