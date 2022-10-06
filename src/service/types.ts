import * as di from "../di/mod.ts";
import * as options from "../options/mod.ts";
import { logLevels, oak } from "./deps.ts";

type Application = oak.Application;
type Middleware = oak.Middleware;
type Router = oak.Router;
type State = oak.State;
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
  logs: logLevels.LevelName;
}

interface Service<TOptions extends ServiceOptions> {
  internalApp: Application;
  router: Router;
  options: options.Options<TOptions>;

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
