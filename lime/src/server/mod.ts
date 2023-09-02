import { type LayoutConfig } from "$cool/lime/server.ts";
import { type ComponentChildren } from "../runtime/drivers/view.ts";
import { ServerContext } from "./context.ts";
import { colors } from "./deps.ts";
export { colors, Status } from "./deps.ts";
import {
  type ErrorHandler,
  type Handler,
  type Handlers,
  type IslandModule,
  type MiddlewareModule,
  type RouteConfig,
  type ServeHandler,
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
export { type InnerRenderFunction, RenderContext } from "./render.ts";

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
      ) => Promise<ComponentChildren | Response> | ComponentChildren;
      // deno-lint-ignore no-explicit-any
      handler?: Handler<any, any> | Handlers<any, any> | UnknownHandler;
      config?: RouteConfig | LayoutConfig | ErrorHandler;
    } | MiddlewareModule
  >;
  islands: Record<string, IslandModule>;
  baseUrl: string;
}

export interface DenoConfig {
  imports?: Record<string, string>;
  importMap?: string;
  tasks?: Record<string, string>;
  lint?: {
    rules: { tags?: string[] };
    exclude?: string[];
  };
  fmt?: {
    exclude?: string[];
  };
  compilerOptions?: {
    jsx?: string;
    jsxImportSource?: string;
  };
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
  const ctx = await ServerContext.fromManifest(routes, opts);

  if (!opts.onListen) {
    opts.onListen = (params) => {
      console.log();
      console.log(
        colors.bgRgb8(colors.rgb8(" 🍋 cool lime ready ", 28), 194),
      );

      const address = colors.rgb8(`http://localhost:${params.port}/`, 33);
      const localLabel = colors.bold("Local:");
      console.log(`    ${localLabel} ${address}\n`);
    };
  }

  const portEnv = Deno.env.get("PORT");
  if (portEnv !== undefined) {
    opts.port ??= parseInt(portEnv, 10);
  }

  const handler = ctx.handler();

  if (opts.port) {
    await bootServer(handler, opts);
  } else {
    // No port specified, check for a free port. Instead of picking just
    // any port we'll check if the next one is free for UX reasons.
    // That way the user only needs to increment a number when running
    // multiple apps vs having to remember completely different ports.
    let firstError;
    for (let port = 8000; port < 8020; port++) {
      try {
        await bootServer(handler, { ...opts, port });
        firstError = undefined;
        break;
      } catch (err) {
        if (err instanceof Deno.errors.AddrInUse) {
          // Throw first EADDRINUSE error
          // if no port is free
          if (!firstError) {
            firstError = err;
          }
          continue;
        }

        throw err;
      }
    }

    if (firstError) {
      throw firstError;
    }
  }
}

async function bootServer(handler: ServeHandler, opts: StartOptions) {
  // @ts-ignore Ignore type error when type checking with Deno versions
  await Deno.serve(opts, handler).finished;
}
