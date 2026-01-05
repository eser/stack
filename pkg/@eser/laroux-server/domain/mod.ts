// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Domain Layer
 *
 * Contains framework-agnostic port interfaces and pure business logic.
 * Adapters implement the interfaces defined here.
 */

// Port interfaces - adapters implement these
export type { RenderContext, Renderer, RenderResult } from "./renderer.ts";
export { noopRenderer } from "./renderer.ts";

export type { HtmlShellBuilder, HtmlShellOptions } from "./html-shell.ts";
export { noopHtmlShellBuilder } from "./html-shell.ts";

// Domain logic - framework-agnostic
export type { HMRMessage } from "./hmr-manager.ts";
export { HMRManager } from "./hmr-manager.ts";

export type { ServerAction } from "./action-registry.ts";
export {
  clearActions,
  getRegisteredActions,
  invokeAction,
  registerAction,
} from "./action-registry.ts";

export type { ApiRouteEntry } from "./route-dispatcher.ts";
export { ApiRouteHandler } from "./route-dispatcher.ts";

export type {
  ProxyEntry,
  ProxyExecutionResult,
} from "./middleware-dispatcher.ts";
export { MiddlewareDispatcher, ProxyHandler } from "./middleware-dispatcher.ts";

export {
  clearServerRequestContext,
  getServerRequestCookies,
  setServerRequestContext,
} from "./request-context.ts";
