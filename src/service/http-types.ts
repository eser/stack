import { oak } from "./deps.ts";

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
  type State,
};
