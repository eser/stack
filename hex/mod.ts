import metadata from "../metadata.json" assert { type: "json" };

export * as cli from "./cli/mod.ts";
export * as data from "./data/mod.ts";
export * as environment from "./environment/mod.ts";
export * as formatters from "./formatters/mod.ts";
export * as functions from "./functions/mod.ts";
export * as generator from "./service/mod.ts";
export * as i18n from "./i18n/mod.ts";
export * as service from "./service/mod.ts";
export * as stdx from "./stdx/mod.ts";
export * as web from "./web/mod.ts";

export { metadata };
