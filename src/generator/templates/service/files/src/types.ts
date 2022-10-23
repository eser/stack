import { type Registry } from "@hex/di/registry.ts";
import {
  type Context,
  type Service,
  type ServiceOptions,
} from "@hex/service/mod.ts";

// interface definitions
interface AppOptions extends ServiceOptions {
  mongoDbConnString?: string;
  sentryDsn?: string;
}

type App = Service<AppOptions>;

export { type App, type AppOptions, type Context, type Registry };
