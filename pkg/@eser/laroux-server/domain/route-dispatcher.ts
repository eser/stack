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
 * Escapes a string for use in a regular expression.
 * Escapes all regex metacharacters including backslashes.
 */
function escapeRegexString(str: string): string {
  // Escape backslashes first, then all other regex metacharacters
  return str.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Converts a route path pattern to a regex pattern
 * Reuses the same logic as page route matching
 */
function pathToRegex(path: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];

  // First, temporarily replace parameter patterns with placeholders
  // to avoid escaping their brackets
  const CATCH_ALL_PLACEHOLDER = "\x00CATCH_ALL\x00";
  const DYNAMIC_PLACEHOLDER = "\x00DYNAMIC\x00";
  const catchAllParams: string[] = [];
  const dynamicParams: string[] = [];

  let processed = path
    .replace(/\[\.\.\.(\w+)\]/g, (_match, paramName) => {
      catchAllParams.push(paramName);
      return CATCH_ALL_PLACEHOLDER;
    })
    .replace(/\[(\w+)\]/g, (_match, paramName) => {
      dynamicParams.push(paramName);
      return DYNAMIC_PLACEHOLDER;
    });

  // Escape all regex metacharacters in the path (including backslashes)
  processed = escapeRegexString(processed);

  // Restore parameter patterns with proper regex capture groups
  let catchAllIndex = 0;
  let dynamicIndex = 0;

  const regexPattern = processed
    .replace(new RegExp(escapeRegexString(CATCH_ALL_PLACEHOLDER), "g"), () => {
      paramNames.push(catchAllParams[catchAllIndex++]!);
      // Use [^?#]* to prevent matching query strings/fragments
      return "([^?#]*)";
    })
    .replace(new RegExp(escapeRegexString(DYNAMIC_PLACEHOLDER), "g"), () => {
      paramNames.push(dynamicParams[dynamicIndex++]!);
      return "([^/]+)";
    });

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
