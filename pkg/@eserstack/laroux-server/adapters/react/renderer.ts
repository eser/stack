// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Renderer Implementation
 * Implements the Renderer port interface using React SSR and RSC
 */

import type {
  RenderContext,
  Renderer,
  RenderResult,
} from "../../domain/renderer.ts";
import * as ssrRenderer from "./ssr-renderer.ts";
import * as rscHandler from "./rsc-handler.ts";
import type { BundlerConfig } from "./rsc-handler.ts";
import * as renderApp from "./render-app.tsx";
import * as inlineRscEmitter from "./inline-rsc-emitter.ts";
import type { LayoutProps, PageProps } from "@eserstack/laroux/router";
import * as logging from "@eserstack/logging";

const rendererLogger = logging.logger.getLogger([
  "laroux-server",
  "react",
  "renderer",
]);

/**
 * Read the data pages receive as their `request` prop from the request.
 */
function readRequestContext(
  request: Request,
): renderApp.RenderAppRequestContext {
  return {
    cookieHeader: request.headers.get("cookie"),
    host: request.headers.get("host"),
    localeParam: new URL(request.url).searchParams.get("locale"),
  };
}

/**
 * Create a React renderer adapter
 *
 * @returns Renderer implementation for React
 */
export function createReactRenderer(): Renderer {
  // Cache module map across requests
  let moduleMapCache: BundlerConfig | null = null;

  return {
    name: "react",

    async renderPage(
      Layout: unknown,
      Page: unknown,
      context: RenderContext,
    ): Promise<RenderResult> {
      rendererLogger.debug(`Rendering page: ${context.pathname}`);

      // Load or use cached module map
      if (moduleMapCache === null) {
        moduleMapCache = await rscHandler.loadModuleMap(context.config);
      }

      // Create the React element tree. Request data travels with this
      // render only, as the request prop of the page and the layout.
      const element = renderApp.renderApp(
        Layout as React.ComponentType<LayoutProps<React.ReactNode>>,
        Page as React.ComponentType<PageProps>,
        {
          pathname: context.pathname,
          params: context.params,
          requestContext: readRequestContext(context.request),
        },
      );

      // Render to HTML with RSC payload
      const result = await ssrRenderer.renderSSR(element, moduleMapCache, {
        streamMode: "await-all",
      });

      // Generate RSC payload script
      const rscPayloadScript = ssrRenderer.generateRSCPayloadScript(
        result.rscPayload,
      );

      rendererLogger.debug(
        `Page rendered, HTML length: ${result.html.length}`,
      );

      return {
        html: result.html,
        rscPayload: rscPayloadScript,
      };
    },

    async renderRSC(
      Layout: unknown,
      Page: unknown,
      context: RenderContext,
    ): Promise<Response> {
      rendererLogger.debug(`Rendering RSC: ${context.pathname}`);

      // Load or use cached module map
      if (moduleMapCache === null) {
        moduleMapCache = await rscHandler.loadModuleMap(context.config);
      }

      // Create the React element tree. Request data travels with this
      // render only, as the request prop of the page and the layout.
      const element = renderApp.renderApp(
        Layout as React.ComponentType<LayoutProps<React.ReactNode>>,
        Page as React.ComponentType<PageProps>,
        {
          pathname: context.pathname,
          params: context.params,
          requestContext: readRequestContext(context.request),
        },
      );

      // Render to RSC streaming response
      return await rscHandler.renderRSCResponse(
        context.config,
        element,
        moduleMapCache,
      );
    },

    generateBootstrapScript(_context: RenderContext): string {
      // Generate the inline RSC bootstrap script
      return inlineRscEmitter.generateInlineBootstrapScript();
    },
  };
}

/**
 * Default React renderer instance
 */
export const reactRenderer: Renderer = createReactRenderer();
