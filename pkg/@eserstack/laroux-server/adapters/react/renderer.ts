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
import { generateRSCPayloadScript, renderSSR } from "./ssr-renderer.ts";
import {
  type BundlerConfig,
  loadModuleMap,
  renderRSCResponse,
} from "./rsc-handler.ts";
import { renderApp } from "./render-app.tsx";
import { generateInlineBootstrapScript } from "./inline-rsc-emitter.ts";
import {
  clearServerRequestContext,
  setServerRequestContext,
} from "../../domain/request-context.ts";
import * as logging from "@eserstack/logging";

const rendererLogger = logging.logger.getLogger([
  "laroux-server",
  "react",
  "renderer",
]);

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

      try {
        // Set request context for SSR (cookies, headers)
        const cookieHeader = context.request.headers.get("cookie");
        setServerRequestContext(cookieHeader);

        // Load or use cached module map
        if (!moduleMapCache) {
          moduleMapCache = await loadModuleMap(context.config);
        }

        // Create the React element tree
        const element = renderApp(
          Layout as React.ComponentType<{ children: React.ReactNode }>,
          Page as React.ComponentType<Record<string, unknown>>,
          {
            pathname: context.pathname,
            params: context.params,
            requestContext: {
              cookieHeader,
              host: context.request.headers.get("host") ?? undefined,
            },
          },
        );

        // Render to HTML with RSC payload
        const result = await renderSSR(element, moduleMapCache, {
          streamMode: "await-all",
        });

        // Generate RSC payload script
        const rscPayloadScript = generateRSCPayloadScript(result.rscPayload);

        rendererLogger.debug(
          `Page rendered, HTML length: ${result.html.length}`,
        );

        return {
          html: result.html,
          rscPayload: rscPayloadScript,
        };
      } finally {
        // Always clear request context
        clearServerRequestContext();
      }
    },

    async renderRSC(
      Layout: unknown,
      Page: unknown,
      context: RenderContext,
    ): Promise<Response> {
      rendererLogger.debug(`Rendering RSC: ${context.pathname}`);

      try {
        // Set request context for RSC
        const cookieHeader = context.request.headers.get("cookie");
        setServerRequestContext(cookieHeader);

        // Load or use cached module map
        if (!moduleMapCache) {
          moduleMapCache = await loadModuleMap(context.config);
        }

        // Create the React element tree
        const element = renderApp(
          Layout as React.ComponentType<{ children: React.ReactNode }>,
          Page as React.ComponentType<Record<string, unknown>>,
          {
            pathname: context.pathname,
            params: context.params,
            requestContext: {
              cookieHeader,
              host: context.request.headers.get("host") ?? undefined,
            },
          },
        );

        // Render to RSC streaming response
        const response = await renderRSCResponse(
          context.config,
          element,
          moduleMapCache,
        );

        return response;
      } finally {
        // Always clear request context
        clearServerRequestContext();
      }
    },

    generateBootstrapScript(_context: RenderContext): string {
      // Generate the inline RSC bootstrap script
      return generateInlineBootstrapScript();
    },
  };
}

/**
 * Default React renderer instance
 */
export const reactRenderer: Renderer = createReactRenderer();
