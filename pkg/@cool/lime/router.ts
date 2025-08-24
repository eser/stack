// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Manifest-driven router for Lime web framework
 * Works with the existing collector-manifest system
 */

import type { WebFrameworkManifest } from "./primitives.ts";
import type { Middleware, RouteContext, RouteHandler } from "./registry.ts";
import {
  getAdapterForComponent,
  renderWithAdapter,
} from "./adapters/registry.ts";
import { islandsManager } from "./islands.ts";

/**
 * Route definition from manifest
 */
export interface RouteDefinition {
  path: string;
  handler: RouteHandler;
  config: {
    adapter?: string;
    layout?: string;
    methods?: string[];
    middleware?: Middleware[];
    cache?: {
      ttl?: number;
      key?: (ctx: RouteContext) => string;
      varyByQuery?: boolean;
    };
  };
}

/**
 * URL pattern matching result
 */
export interface MatchResult {
  route: RouteDefinition;
  params: Record<string, string>;
}

/**
 * Manifest-driven router implementation
 */
export class LimeRouter {
  private routes: RouteDefinition[] = [];
  private layouts = new Map<string, any>();
  private globalMiddleware: Middleware[] = [];

  /**
   * Add a single route
   */
  addRoute(route: RouteDefinition): void {
    this.routes.push(route);
  }

  /**
   * Load routes from registry
   */
  loadFromRegistry(registry: any): void {
    // Get routes from registry and add them
    const routes = registry.getRoutes();
    for (const [path, { handler, config }] of routes) {
      this.addRoute({
        path,
        handler,
        config,
      });
    }

    // Get layouts from registry
    const layouts = registry.getLayouts();
    for (const [name, { component }] of layouts) {
      this.layouts.set(name, component);
    }
  }

  /**
   * Load routes from web framework manifest
   */
  loadFromManifest(manifest: WebFrameworkManifest): void {
    // Load routes
    for (const routeData of manifest.routes) {
      const route: RouteDefinition = {
        path: routeData.path,
        handler: this.resolveHandler(routeData.handler),
        config: routeData.config,
      };
      this.routes.push(route);
    }

    // Load layouts
    for (const layoutData of manifest.layouts) {
      this.layouts.set(
        layoutData.name,
        this.resolveComponent(layoutData.component),
      );
    }

    // Sort routes by specificity (more specific routes first)
    this.routes.sort((a, b) =>
      this.getRouteSpecificity(b.path) - this.getRouteSpecificity(a.path)
    );
  }

  /**
   * Add global middleware
   */
  use(middleware: Middleware): void {
    this.globalMiddleware.push(middleware);
  }

  /**
   * Handle incoming request
   */
  async handle(req: Request, info?: Deno.ServeHandlerInfo): Promise<Response> {
    const url = new URL(req.url);
    const match = this.matchRoute(url.pathname, req.method);

    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    // Create route context
    const context: RouteContext = {
      url,
      req,
      params: match.params,
      query: url.searchParams,
      state: {},
      render: (component: unknown) =>
        this.renderComponent(component, context, match.route.config),
    };

    try {
      // Run middleware chain
      const middlewares = [
        ...this.globalMiddleware,
        ...(match.route.config.middleware || []),
      ];

      let response = await this.runMiddlewareChain(
        middlewares,
        context,
        async () => {
          // Execute route handler
          const result = await match.route.handler(context);

          if (result instanceof Response) {
            return result;
          }

          // Render component result
          return await this.renderComponent(
            result,
            context,
            match.route.config,
          );
        },
      );

      return response;
    } catch (error) {
      console.error("Route handler error:", error);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  /**
   * Match URL to route
   */
  private matchRoute(pathname: string, method: string): MatchResult | null {
    for (const route of this.routes) {
      // Check HTTP method
      const allowedMethods = route.config.methods || ["GET"];
      if (!allowedMethods.includes(method)) {
        continue;
      }

      const params = this.matchPattern(route.path, pathname);
      if (params !== null) {
        return { route, params };
      }
    }

    return null;
  }

  /**
   * Match URL pattern and extract parameters
   */
  private matchPattern(
    pattern: string,
    pathname: string,
  ): Record<string, string> | null {
    // Convert route pattern to regex
    const paramNames: string[] = [];

    const regexPattern = pattern
      .replace(/\/:([^/]+)/g, (_, paramName) => {
        paramNames.push(paramName);
        return "/([^/]+)";
      })
      .replace(/\/\*([^/]*)/g, (_, paramName) => {
        paramNames.push(paramName || "wildcard");
        return "/(.*)";
      });

    const regex = new RegExp(`^${regexPattern}$`);
    const match = pathname.match(regex);

    if (!match) return null;

    // Extract parameters
    const params: Record<string, string> = {};
    for (let i = 0; i < paramNames.length; i++) {
      params[paramNames[i]] = decodeURIComponent(match[i + 1]);
    }

    return params;
  }

  /**
   * Get route specificity for sorting
   */
  private getRouteSpecificity(pattern: string): number {
    let specificity = 0;

    // Static segments are more specific
    const segments = pattern.split("/").filter((s) => s);
    for (const segment of segments) {
      if (segment.startsWith(":")) {
        specificity += 1; // Parameter segment
      } else if (segment === "*" || segment.startsWith("*")) {
        specificity += 0; // Wildcard segment
      } else {
        specificity += 2; // Static segment
      }
    }

    return specificity;
  }

  /**
   * Run middleware chain
   */
  private async runMiddlewareChain(
    middlewares: Middleware[],
    context: RouteContext,
    handler: () => Promise<Response>,
  ): Promise<Response> {
    if (middlewares.length === 0) {
      return handler();
    }

    let index = 0;

    const next = async (): Promise<Response> => {
      if (index >= middlewares.length) {
        return handler();
      }

      const middleware = middlewares[index++];
      return middleware(context, next);
    };

    return next();
  }

  /**
   * Render component with appropriate adapter
   */
  private async renderComponent(
    component: unknown,
    context: RouteContext,
    routeConfig: RouteDefinition["config"],
  ): Promise<Response> {
    try {
      // Wrap with layout if specified
      let wrappedComponent = component;
      if (routeConfig.layout) {
        const layout = this.layouts.get(routeConfig.layout);
        if (layout) {
          wrappedComponent = layout({ children: component });
        }
      }

      // Render with adapter
      let html = await renderWithAdapter(
        wrappedComponent,
        {
          url: context.url,
          req: context.req,
          props: context.params,
          mode: "ssr",
        },
        routeConfig.adapter,
      );

      // Add islands hydration scripts if needed
      const pageId = context.url.pathname;
      const hydrationHTML = islandsManager.generateHydrationHTML(pageId);

      if (hydrationHTML) {
        // Inject hydration scripts before closing body tag
        html = html.replace("</body>", `${hydrationHTML}\n</body>`);
      }

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          // Add cache headers if configured
          ...(this.getCacheHeaders(routeConfig.cache, context)),
        },
      });
    } catch (error) {
      console.error("Component render error:", error);
      return new Response("Render Error", { status: 500 });
    }
  }

  /**
   * Get cache headers based on route configuration
   */
  private getCacheHeaders(
    cacheConfig?: RouteDefinition["config"]["cache"],
    context?: RouteContext,
  ): Record<string, string> {
    if (!cacheConfig || !cacheConfig.ttl) {
      return {};
    }

    const headers: Record<string, string> = {
      "Cache-Control": `public, max-age=${cacheConfig.ttl}`,
    };

    // Add ETag if cache key is configured
    if (cacheConfig.key && context) {
      const etag = `"${this.hashString(cacheConfig.key(context))}"`;
      headers["ETag"] = etag;
    }

    // Add Vary header if configured
    if (cacheConfig.varyByQuery) {
      headers["Vary"] = "Accept, Accept-Encoding";
    }

    return headers;
  }

  /**
   * Simple string hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Resolve handler from manifest identifier
   */
  private resolveHandler(handlerId: string): RouteHandler {
    // This would resolve handlers from the module registry
    // For now, return a placeholder
    return async (ctx) => {
      return new Response(`Handler ${handlerId} not implemented`, {
        status: 501,
      });
    };
  }

  /**
   * Resolve component from manifest identifier
   */
  private resolveComponent(componentId: string): any {
    // This would resolve components from the module registry
    // For now, return a placeholder
    return ({ children }: { children: any }) => children;
  }

  /**
   * Get all registered routes (for debugging)
   */
  getRoutes(): RouteDefinition[] {
    return [...this.routes];
  }

  /**
   * Get all registered layouts (for debugging)
   */
  getLayouts(): Map<string, any> {
    return new Map(this.layouts);
  }
}
