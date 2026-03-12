// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * RSC Renderer with Streaming
 * Renders React Server Components to the RSC wire protocol format
 */

import {
  type BundlerConfig,
  renderToReadableStream,
} from "./rsc-flight-renderer.ts";
import { current, NotFoundError } from "@eser/standards/runtime";
import type { AppConfig } from "@eser/laroux/config";
import * as logging from "@eser/logging";

const rscRenderer = logging.logger.getLogger([
  "laroux-server",
  "react",
  "rsc-handler",
]);

// Re-export BundlerConfig for consumers
export type { BundlerConfig };

// Constants
const MODULE_MAP_FILENAME = "module-map.json";

/**
 * Load the module map generated during build
 * @param config - Application configuration
 * @returns Bundler configuration with component mappings
 */
export async function loadModuleMap(config: AppConfig): Promise<BundlerConfig> {
  try {
    const moduleMapPath = current.path.resolve(
      config.distDir,
      "client",
      MODULE_MAP_FILENAME,
    );
    const content = await current.fs.readTextFile(moduleMapPath);
    const map: BundlerConfig = JSON.parse(content);
    rscRenderer.debug(
      `Loaded module map with ${Object.keys(map).length} entries`,
    );
    return map;
  } catch (error) {
    rscRenderer.warn("Module map not found, using empty map");
    if (error instanceof NotFoundError) {
      rscRenderer.warn("   Run `deno task build` to generate the module map");
    }
    return {};
  }
}

/**
 * Render a React Server Component tree to RSC wire format stream
 *
 * This implements the React Server Components protocol:
 * - Server components render on the server and stream as JSON
 * - Client components are sent as references (not code)
 * - Uses RSC wire format: J0: (JSON), M1: (Module reference), etc.
 * - Supports progressive rendering with Suspense
 *
 * @param config - Application configuration
 * @param component - Root React element to render
 * @param moduleMap - Optional pre-loaded module map (for current mode)
 * @returns ReadableStream of RSC wire format chunks
 */
export async function renderRSC(
  config: AppConfig,
  component: React.ReactElement,
  moduleMap?: BundlerConfig,
): Promise<ReadableStream> {
  try {
    // Use provided module map or load from disk
    const bundlerConfig = moduleMap ?? await loadModuleMap(config);

    // Debug: log module map
    rscRenderer.debug("Module map keys:", {
      keys: Object.keys(bundlerConfig),
    });
    rscRenderer.debug(
      "Module map:",
      { moduleMap: bundlerConfig },
    );

    // Render to RSC wire format stream
    // renderToReadableStream now returns immediately (not async)
    const stream = renderToReadableStream(component, bundlerConfig);

    rscRenderer.debug("RSC stream created");
    return stream;
  } catch (error) {
    rscRenderer.error("RSC rendering error:", { error });

    // Return error stream in RSC format
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStream = new ReadableStream({
      start(controller) {
        // Error chunk: E0:{"message":"..."}
        const errorChunk = `E0:${JSON.stringify({ message: errorMessage })}\n`;
        controller.enqueue(new TextEncoder().encode(errorChunk));
        controller.close();
      },
    });

    return errorStream;
  }
}

/**
 * Convert RSC stream to HTTP Response with proper headers
 * @param stream - RSC wire format stream
 * @returns HTTP Response ready to send to client
 */
export function streamToResponse(stream: ReadableStream): Response {
  // Return the stream directly - Deno will handle Transfer-Encoding: chunked automatically
  // Any intermediate piping or TransformStream can cause buffering issues
  return new Response(stream, {
    headers: {
      "Content-Type": "text/x-component; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Render RSC and return as HTTP Response (convenience method)
 * @param config - Application configuration
 * @param component - Root React element to render
 * @param moduleMap - Optional pre-loaded module map (for current mode)
 * @returns HTTP Response with RSC stream
 */
export async function renderRSCResponse(
  config: AppConfig,
  component: React.ReactElement,
  moduleMap?: BundlerConfig,
): Promise<Response> {
  const stream = await renderRSC(config, component, moduleMap);
  return streamToResponse(stream);
}
