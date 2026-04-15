// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// API Route Handler for laroux.js
// Handles file-based API routes (route.ts files)

import * as logging from "@eserstack/logging";
import { runtime } from "@eserstack/standards/cross-runtime";
import type {
  ApiRouteModule,
  HttpMethod,
  RouteParams,
} from "@eserstack/laroux/router";

const apiLogger = logging.logger.getLogger(["laroux-server", "api-handler"]);

/**
 * API route definition from the generated registry
 */
export type ApiRouteEntry = {
  path: string;
  modulePath: string;
};

/**
 * Convert Next.js style route pattern to URLPattern syntax.
 * - [param] -> :param (dynamic segment)
 * - [...param] -> :param* (catch-all segment, matches zero or more)
 *
 * Also tracks parameter names and whether they're catch-all for post-processing.
 */
function convertToUrlPattern(
  routePath: string,
): { pattern: string; catchAllParams: Set<string> } {
  const catchAllParams = new Set<string>();

  const pattern = routePath
    // First convert catch-all segments [...param] to :param*
    .replace(/\[\.\.\.(\w+)\]/g, (_match, paramName) => {
      catchAllParams.add(paramName);
      return `:${paramName}*`;
    })
    // Then convert dynamic segments [param] to :param
    .replace(/\[(\w+)\]/g, (_match, paramName) => {
      return `:${paramName}`;
    });

  return { pattern, catchAllParams };
}

/**
 * Matches a pathname against a route pattern using URLPattern API.
 * Returns extracted route parameters or null if no match.
 */
function matchRoutePath(
  pathname: string,
  routePath: string,
): RouteParams | null {
  const { pattern, catchAllParams } = convertToUrlPattern(routePath);

  // URLPattern for pathname matching only
  const urlPattern = new URLPattern({ pathname: pattern });
  const match = urlPattern.exec({ pathname });

  if (!match) {
    return null;
  }

  const params: RouteParams = {};
  const groups = match.pathname.groups;

  for (const [name, value] of Object.entries(groups)) {
    if (catchAllParams.has(name)) {
      // Catch-all params: split by "/" and filter empty segments
      params[name] = value ? value.split("/").filter(Boolean) : [];
    } else {
      // Regular params: use value directly (already decoded by URLPattern)
      params[name] = value ?? "";
    }
  }

  return params;
}

/**
 * API Route Handler
 * Manages loading and executing API routes
 */
export class ApiRouteHandler {
  private routes: ApiRouteEntry[] = [];
  private moduleCache = new Map<string, ApiRouteModule>();
  private registryDir: string = "";

  /**
   * Load API routes from the generated registry
   */
  async loadRoutes(distDir: string): Promise<void> {
    try {
      // NOTE: Must use variable + file:// - deno publish rewrites analyzable dynamic imports
      const registryPath = `file://${distDir}/server/api-routes.ts`;
      this.registryDir = runtime.path.resolve(distDir, "server");
      const registry = await import(registryPath);
      this.routes = registry.apiRoutes || [];
      apiLogger.debug(`Loaded ${this.routes.length} API route(s)`);
    } catch {
      // No API routes generated - this is fine
      this.routes = [];
      apiLogger.debug("No API routes registry found");
    }
  }

  /**
   * Handle an API request
   * Returns null if no matching route found
   */
  async handleRequest(
    req: Request,
    pathname: string,
  ): Promise<Response | null> {
    const url = new URL(req.url);
    const method = req.method as HttpMethod;

    for (const route of this.routes) {
      const params = matchRoutePath(pathname, route.path);

      if (params !== null) {
        apiLogger.debug(
          `API route matched: ${method} ${pathname} -> ${route.path}`,
        );

        try {
          // Resolve module path relative to the registry directory
          const resolvedPath = runtime.path.resolve(
            this.registryDir,
            route.modulePath,
          );

          // Load module (with caching)
          let module = this.moduleCache.get(resolvedPath);
          if (!module) {
            // NOTE: Must use variable + file:// - deno publish rewrites analyzable dynamic imports
            const moduleImportPath = `file://${resolvedPath}`;
            module = await import(moduleImportPath) as ApiRouteModule;
            this.moduleCache.set(resolvedPath, module);
          }

          // Get handler for this method
          const handler = module[method];
          if (!handler) {
            apiLogger.debug(`Method ${method} not allowed for ${route.path}`);
            return new Response("Method Not Allowed", {
              status: 405,
              headers: {
                "Allow": this.getAllowedMethods(module).join(", "),
              },
            });
          }

          // Execute handler
          const response = await handler({
            request: req,
            params,
            searchParams: url.searchParams,
          });

          return response;
        } catch (error) {
          apiLogger.error(`API route error: ${route.path}`, { error });
          // Don't expose error details to client - only log server-side
          return new Response(
            JSON.stringify({
              error: "Internal Server Error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      }
    }

    return null;
  }

  /**
   * Get allowed methods for a module
   */
  private getAllowedMethods(module: ApiRouteModule): HttpMethod[] {
    const methods: HttpMethod[] = [];
    if (module.GET) methods.push("GET");
    if (module.POST) methods.push("POST");
    if (module.PUT) methods.push("PUT");
    if (module.DELETE) methods.push("DELETE");
    if (module.PATCH) methods.push("PATCH");
    if (module.HEAD) methods.push("HEAD");
    if (module.OPTIONS) methods.push("OPTIONS");
    return methods;
  }

  /**
   * Clear module cache (for HMR)
   */
  clearCache(): void {
    this.moduleCache.clear();
  }
}
