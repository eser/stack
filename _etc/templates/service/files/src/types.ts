import { type Registry } from "$cool/hex/di/registry.ts";
import {
  type Context,
  type Service,
  type ServiceOptions,
} from "$cool/hex/service/mod.ts";

// interface definitions
export interface AppOptions extends ServiceOptions {
  mongoDbConnString?: string;
  sentryDsn?: string;
}

export type App = Service<AppOptions>;

export { type Context, type Registry };
