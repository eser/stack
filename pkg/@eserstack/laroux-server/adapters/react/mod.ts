// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Adapter for @eserstack/laroux-server
 *
 * This module provides React-specific implementations for the server's
 * rendering port interfaces. It includes:
 * - RSC (React Server Components) Flight renderer
 * - SSR (Server-Side Rendering) with RSC payload embedding
 * - HTML shell builder for React applications
 *
 * @example
 * ```ts
 * import * as larouxServer from "@eserstack/laroux-server";
 * import * as reactAdapter from "@eserstack/laroux-server/adapters/react";
 *
 * await larouxServer.startServer({
 *   mode: "dev",
 *   renderer: reactAdapter.reactRenderer,
 *   htmlShell: reactAdapter.reactHtmlShellBuilder,
 * });
 * ```
 */

// The protocol and page types the exports below take and return
export type {
  ModuleReference,
  RSCChunk,
  ServerActionReference,
} from "@eserstack/laroux-react/protocol";
export type {
  LayoutProps,
  PageProps,
  PageRequest,
  RouteParams,
} from "@eserstack/laroux";

// Renderer port implementation
export { createReactRenderer, reactRenderer } from "./renderer.ts";

// HTML shell port implementation
export {
  createReactHtmlShellBuilder,
  reactHtmlShellBuilder,
} from "./html-shell.ts";

// RSC Flight renderer (low-level)
export {
  type BundlerConfig,
  renderToReadableStream,
  renderValueToReadableStream,
} from "./rsc-flight-renderer.ts";

// RSC handler (HTTP layer)
export {
  loadModuleMap,
  renderRSC,
  renderRSCResponse,
  streamToResponse,
} from "./rsc-handler.ts";

// SSR renderer
export {
  generateRSCPayloadScript,
  renderSSR,
  serializeRSCPayload,
  type SSROptions,
  type SSRResult,
} from "./ssr-renderer.ts";

// Inline RSC emitter (for streaming)
export {
  chunkToInlineScript,
  createInlineRSCStream,
  createInlineTransformStream,
  generateInlineBootstrapScript,
  generateInlineCompletionScript,
  type InlineChunkCallback,
} from "./inline-rsc-emitter.ts";

// App composition helper
export {
  renderApp,
  type RenderAppProps,
  type RenderAppRequestContext,
} from "./render-app.ts";
