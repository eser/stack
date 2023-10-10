import { type ComponentChildren } from "../runtime/drivers/view.tsx";
import {
  type AsyncLayout,
  type AsyncRoute,
  type LayoutContext,
  type RouteContext,
  type StartOptions,
} from "./types.ts";
import { checkAsyncComponent } from "./render.ts";
import { type AppContext } from "./types.ts";

export function defineConfig(config: StartOptions): StartOptions {
  return config;
}

// Route creation helpers
export function defineRoute<
  T,
>(
  fn: (
    req: Request,
    ctx: RouteContext<void, T>,
  ) => ComponentChildren | Response | Promise<ComponentChildren | Response>,
): AsyncRoute<void, T> {
  if (checkAsyncComponent(fn)) {
    // deno-lint-ignore no-explicit-any
    return fn as any;
  }

  // deno-lint-ignore require-await
  return async (req, ctx) => fn(req, ctx);
}

// Layout creation helper
export function defineLayout<T>(
  fn: (
    req: Request,
    ctx: LayoutContext<void, T>,
  ) => ComponentChildren | Response | Promise<ComponentChildren | Response>,
): AsyncLayout<void, T> {
  if (checkAsyncComponent(fn)) {
    // deno-lint-ignore no-explicit-any
    return fn as any;
  }

  // deno-lint-ignore require-await
  return async (req, ctx) => fn(req, ctx);
}

// App creation helper
export function defineApp<T>(
  fn: (
    req: Request,
    ctx: AppContext<void, T>,
  ) => ComponentChildren | Response | Promise<ComponentChildren | Response>,
): AsyncLayout<void, T> {
  if (checkAsyncComponent(fn)) {
    // deno-lint-ignore no-explicit-any
    return fn as any;
  }

  // deno-lint-ignore require-await
  return async (req, ctx) => fn(req, ctx);
}
