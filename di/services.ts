import { Registry } from "./container.ts";

export const registry = new Registry();
export const services = registry.build();

export { services as default };
