import { Registry } from "./container.ts";

export const registry = new Registry();
export const services = registry.build();

export const di = (strings: TemplateStringsArray) => services.get(strings[0]!);

export { services as default };
