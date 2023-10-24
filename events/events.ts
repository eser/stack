import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry = new Registry();
export const dispatcher = registry.build();

export const events = factory(dispatcher);

export { events as default };