import * as di from "../../lib/di/mod.ts";
import * as options from "../../lib/options/mod.ts";
import { log, oak } from "./deps.ts";

type State = oak.State;
// deno-lint-ignore no-explicit-any
type Application<AS extends State = Record<string, any>> = oak.Application<AS>;
type Middleware = oak.Middleware;
type Router = oak.Router;
type Context = oak.Context & {
  params: Record<string, string>;
};
type RouteParams<Route extends string> = oak.RouteParams<Route>;
type Route<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.Route<R, P, S>;
type RouterMiddleware<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.RouterMiddleware<R, P, S>;
type RouterContext<
  R extends string,
  P extends RouteParams<R> = RouteParams<R>,
  // deno-lint-ignore no-explicit-any
  S extends State = Record<string, any>,
> = oak.RouterContext<R, P, S>;

type HttpMethods =
  | "all"
  | "get"
  | "post"
  | "patch"
  | "put"
  | "delete"
  | "head"
  | "options";

interface ServiceOptions {
  port: number;
  logs: log.LevelName;
}

interface ServiceState<TOptions extends ServiceOptions> {
  router: Router;
  registry: di.Registry;
  options: options.Options<TOptions>;
}

interface Service<TOptions extends ServiceOptions>
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
    configureOptionsFn: options.ConfigureOptionsFn<TOptions>,
  ) => Promise<void>;

  configureDI: (
    configureDIFn: (registry: di.Registry) => Promise<void> | void,
  ) => Promise<void>;

  start: () => Promise<void>;
}

export {
  type Application,
  type Context,
  type HttpMethods,
  type Middleware,
  type Route,
  type RouteParams,
  type Router,
  type RouterContext,
  type RouterMiddleware,
  type Service,
  type ServiceOptions,
  type State,
};
