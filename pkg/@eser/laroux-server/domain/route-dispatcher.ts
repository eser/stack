// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// API Route Handler for laroux.js
// Handles file-based API routes (route.ts files)

import * as logging from "@eser/logging";
import { runtime } from "@eser/standards/runtime";
import type {
  ApiRouteModule,
  HttpMethod,
  RouteParams,
} from "@eser/laroux/router";

const apiLogger = logging.logger.getLogger(["laroux-server", "api-handler"]);

/**
 * API route definition from the generated registry
 */
export type ApiRouteEntry = {
  path: string;
  modulePath: string;
};

/**
 * Converts a route path pattern to a regex pattern
 * Reuses the same logic as page route matching
 */
function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  // Handle catch-all routes [...slug]
  // Use [^?#]* instead of .* to prevent matching query strings/fragments
  // and avoid issues with incomplete URL sanitization
  const regexPattern = path
    .replace(/\[\.\.\.(\w+)\]/g, (_match, paramName) => {
      paramNames.push(paramName);
      return "([^?#]*)";
    })
    // Handle dynamic segments [slug]
    .replace(/\[(\w+)\]/g, (_match, paramName) => {
      paramNames.push(paramName);
      return "([^/]+)";
    })
    // Escape forward slashes
    .replace(/\//g, "\\/");

  return {
    regex: new RegExp(`^${regexPattern}$`),
    paramNames,
  };
}

/**
 * Matches a pathname against a route pattern
 */
function matchRoutePath(
  pathname: string,
  routePath: string,
): RouteParams | null {
  const { regex, paramNames } = pathToRegex(routePath);
  const match = pathname.match(regex);

  if (!match) {
    return null;
  }

  const params: RouteParams = {};
  paramNames.forEach((name, index) => {
    const value = match[index + 1];

    // Handle catch-all routes (split by /)
    if (routePath.includes(`[...${name}]`)) {
      params[name] = value ? value.split("/").filter(Boolean) : [];
    } else {
      params[name] = value ?? "";
    }
  });

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
      const registryPath = `${distDir}/server/api-routes.ts`;
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
            module = await import(resolvedPath) as ApiRouteModule;
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
