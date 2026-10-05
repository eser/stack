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
import * as router from "@eserstack/laroux/router";
import * as buildModule from "./build-module.ts";

const apiLogger = logging.logger.getLogger(["laroux-server", "api-handler"]);

/**
 * API route definition from the generated registry
 */
export type ApiRouteEntry = {
  path: string;
  modulePath: string;
};

/** The API routes of one build and the route modules loaded from it. */
type LoadedApiRoutes = {
  readonly routes: readonly ApiRouteEntry[];
  /** Directory the registry's module paths are relative to */
  readonly registryDir: string;
  readonly buildId: string;
  /** Route modules of this build, by resolved path */
  readonly moduleCache: Map<string, ApiRouteModule>;
};

/**
 * API Route Handler
 * Manages loading and executing API routes
 */
export class ApiRouteHandler {
  private loaded: LoadedApiRoutes = {
    routes: [],
    registryDir: "",
    buildId: "",
    moduleCache: new Map(),
  };

  /**
   * Load the API routes of a build from its generated registry,
   * <distDir>/server/api-routes.ts. A build without route.ts files writes no
   * registry, so it has no API routes. Route modules load on their first
   * request, by URLs that carry the build id: after a rebuild, loading the
   * new build makes requests import the rebuilt route modules.
   *
   * @param distDir - Build output directory
   * @param buildId - Id of the build to load
   */
  async loadRoutes(distDir: string, buildId: string): Promise<void> {
    const registryDir = runtime.path.resolve(distDir, "server");
    const registry = await buildModule.importOptionalBuildModule(
      runtime.path.join(registryDir, "api-routes.ts"),
      buildId,
    );
    const entries = registry?.["apiRoutes"];
    const routes: readonly ApiRouteEntry[] = Array.isArray(entries)
      ? entries
      : [];

    // Replaced in one step: a request that started before keeps the build
    // it started with, so it never mixes the modules of two builds.
    this.loaded = { routes, registryDir, buildId, moduleCache: new Map() };

    apiLogger.debug(`Loaded ${routes.length} API route(s)`);
  }

  /**
   * Find the first route whose path matches the pathname. API routes use the
   * page router's matcher, so their params are percent-decoded and a
   * catch-all matches its bare prefix the same way.
   */
  private findRoute(
    routes: readonly ApiRouteEntry[],
    pathname: string,
  ): { route: ApiRouteEntry; params: RouteParams } | null {
    for (const route of routes) {
      const params = router.matchRoute(pathname, route);
      if (params !== null) {
        return { route, params };
      }
    }

    return null;
  }

  /**
   * Handle an API request
   * Returns null if no matching route found
   */
  async handleRequest(
    req: Request,
    pathname: string,
  ): Promise<Response | null> {
    const loaded = this.loaded;
    const match = this.findRoute(loaded.routes, pathname);
    if (match === null) {
      return null;
    }

    const { route, params } = match;
    const url = new URL(req.url);
    const method = req.method as HttpMethod;

    apiLogger.debug(
      `API route matched: ${method} ${pathname} -> ${route.path}`,
    );

    try {
      // Resolve module path relative to the registry directory
      const resolvedPath = runtime.path.resolve(
        loaded.registryDir,
        route.modulePath,
      );

      // Load module (with caching)
      let module = loaded.moduleCache.get(resolvedPath);
      if (module === undefined) {
        module = await import(
          buildModule.toBuildModuleUrl(resolvedPath, loaded.buildId)
        ) as ApiRouteModule;
        loaded.moduleCache.set(resolvedPath, module);
      }

      // Get handler for this method
      const handler = module[method];
      if (handler === undefined) {
        apiLogger.debug(`Method ${method} not allowed for ${route.path}`);
        return new Response("Method Not Allowed", {
          status: 405,
          headers: {
            "Allow": this.getAllowedMethods(module).join(", "),
          },
        });
      }

      // Execute handler
      return await handler({
        request: req,
        params,
        searchParams: url.searchParams,
      });
    } catch (error) {
      // Handled here: logged once with the route, and the client gets a
      // fixed message without the error's details.
      await apiLogger.with({ route: route.path, method, error }).error(
        "API route handler failed to load or threw; answered 500",
      );
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

  /**
   * Get allowed methods for a module
   */
  private getAllowedMethods(module: ApiRouteModule): HttpMethod[] {
    const methods: HttpMethod[] = [
      "GET",
      "POST",
      "PUT",
      "DELETE",
      "PATCH",
      "HEAD",
      "OPTIONS",
    ];
    return methods.filter((method) => module[method] !== undefined);
  }
}
