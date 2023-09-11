import * as dotenv from "../../dotenv/mod.ts";
import * as di from "../../di/mod.ts";
import { log, oak } from "./deps.ts";

export type State = oak.State;
// deno-lint-ignore no-explicit-any
export type Application<AS extends State = Record<string, any>> =
  oak.Application<AS>;
export type Middleware = oak.Middleware;
export type Router = oak.Router;
export type Context = oak.Context & {
  params: Record<string, string>;
};
export type RouteParams<Route extends string> = oak.RouteParams<Route>;
export type Route<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.Route<R, P, S>;
export type RouterMiddleware<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.RouterMiddleware<R, P, S>;
export type RouterContext<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.RouterContext<R, P, S>;

export type HttpMethods =
  | "all"
  | "get"
  | "post"
  | "patch"
  | "put"
  | "delete"
  | "head"
  | "options";

export interface ServiceOptions {
  port: number;
  logs: log.LevelName;
}

export interface ServiceState<TOptions extends ServiceOptions> {
  router: Router;
  registry: di.Registry;
  options: TOptions;
}

export interface Service<TOptions extends ServiceOptions>
  extends ServiceState<TOptions> {
  internalApp: Application<ServiceState<TOptions>>;

  addMiddleware: (middleware: Middleware) => void;
  addHealthCheck: (path: string) => void;
  addRoute: <
    R extends string,
    P extends RouteParams<R> = RouteParams<R>,
    // deno-lint-ignore no-explicit-any
    S extends State = Record<string, any>,
  >(
    method: HttpMethods,
    path: R,
    ...middlewares: [
      ...RouterMiddleware<R, P, S>[],
      (ctx: RouterContext<R, P, S> | Context) => unknown,
    ] | [
      // FIXME sorry, it's mandatory hack for typescript
      (ctx: Context) => unknown,
    ]
  ) => void;

  configureOptions: (
    configureOptionsFn: dotenv.ConfigureFn<TOptions>,
  ) => Promise<void>;

  configureDI: (
    configureDIFn: (registry: di.Registry) => Promise<void> | void,
  ) => Promise<void>;

  start: () => Promise<void>;
}
