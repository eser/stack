import { ServerContext } from "./context.ts";
export { type FromManifestOptions } from "./context.ts";
export { colors, Status } from "./deps.ts";
import {
  type ErrorHandler,
  type Handler,
  type Handlers,
  type IslandModule,
  type LayoutConfig,
  type MiddlewareModule,
  type RouteConfig,
  type ServeHandlerInfo,
  type StartOptions,
  type UnknownHandler,
} from "./types.ts";
export {
  defineApp,
  defineConfig,
  defineLayout,
  defineRoute,
} from "./defines.ts";
export {
  type AppContext,
  type AppProps,
  type DenoConfig,
  type ErrorHandler,
  type ErrorHandlerContext,
  type ErrorPageProps,
  type Handler,
  type HandlerContext,
  type Handlers,
  type LayoutConfig,
  type LayoutContext,
  type LayoutProps,
  type LimeOptions,
  type MiddlewareHandler,
  type MiddlewareHandlerContext,
  type MultiHandler,
  type PageProps,
  type Plugin,
  type PluginAsyncRenderContext,
  type PluginAsyncRenderFunction,
  type PluginRenderContext,
  type PluginRenderFunction,
  type PluginRenderFunctionResult,
  type PluginRenderResult,
  type PluginRenderScripts,
  type PluginRenderStyleTag,
  type RenderFunction,
  type RouteConfig,
  type RouteContext,
  type ServeHandlerInfo,
  type StartOptions,
  type UnknownHandler,
  type UnknownHandlerContext,
  type UnknownPageProps,
} from "./types.ts";
import { startFromContext } from "./boot.ts";
export { type InnerRenderFunction, RenderContext } from "./render.ts";
export { type DestinationKind } from "./router.ts";

export interface Manifest {
  routes: Record<
    string,
    {
      // Use a more loose route definition type because
      // TS has trouble inferring normal vs aync functions. It cannot infer based on function arity
      default?: (
        // deno-lint-ignore no-explicit-any
        propsOrRequest: any,
        // deno-lint-ignore no-explicit-any
        ctx: any,
        // deno-lint-ignore no-explicit-any
      ) => Promise<any | Response> | any;
      // deno-lint-ignore no-explicit-any
      handler?: Handler<any, any> | Handlers<any, any> | UnknownHandler;
      config?: RouteConfig | LayoutConfig | ErrorHandler;
    } | MiddlewareModule
  >;
  islands: Record<string, IslandModule>;
  baseUrl: string;
}

export { ServerContext };

export async function createHandler(
  routes: Manifest,
  opts: StartOptions = {},
): Promise<
  (req: Request, connInfo?: ServeHandlerInfo) => Promise<Response>
> {
  const ctx = await ServerContext.fromManifest(routes, opts);
  return ctx.handler();
}

export async function start(routes: Manifest, opts: StartOptions = {}) {
  const ctx = await ServerContext.fromManifest(routes, {
    ...opts,
    skipSnapshot: false,
    dev: false,
  });

  await startFromContext(ctx, opts.server ?? opts);
}
