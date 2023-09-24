import { Registry } from "./container.ts";
import { factory } from "./fluent-api-factory.ts";

export const registry = new Registry();
export const services = registry.build();

export const di = factory(services);

export { di as default };
