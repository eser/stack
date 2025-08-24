// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Enhanced registry for web framework features in Lime.
 * Works with the existing module registration pattern.
 */

import {
  type ServerActionDefinition,
  serverActionsRegistry,
} from "./server-actions.ts";
import {
  type IslandDefinition,
  type IslandHydrationStrategy,
  islandsManager,
} from "./islands.ts";

export type AdapterType = "react" | "preact" | "static" | string;

/**
 * Route handler function type
 */
export type RouteHandler<TState = unknown> = (
  ctx: RouteContext<TState>,
) => Response | Promise<Response> | JSX.Element | Promise<JSX.Element>;

/**
 * Route configuration
 */
export interface RouteConfig {
  /** View adapter to use for this route */
  adapter?: AdapterType;
  /** Layout to wrap this route */
  layout?: string;
  /** HTTP methods this route handles */
  methods?:
    ("GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS")[];
  /** Route-specific middleware */
  middleware?: Middleware[];
  /** Cache configuration */
  cache?: CacheConfig;
}

/**
 * Layout component configuration
 */
export interface LayoutConfig {
  /** Parent layout to extend */
  parent?: string;
  /** View adapter */
  adapter?: AdapterType;
}

/**
 * Island component configuration
 */
export interface IslandConfig {
  /** View adapter for this island */
  adapter: AdapterType;
  /** Props this island accepts */
  props?: string[];
  /** Whether this island should be lazy loaded */
  lazy?: boolean;
  /** Hydration strategy */
  hydration?: IslandHydrationStrategy;
}

/**
 * Server Component configuration (React 19)
 */
export interface ServerComponentConfig {
  /** Whether this is an async server component */
  async?: boolean;
  /** Cache configuration for server component */
  cache?: CacheConfig;
}

/**
 * Server Action configuration (React 19)
 */
export interface ServerActionConfig {
  /** Validation schema type */
  validation?: "zod" | "joi" | "yup" | string;
  /** Rate limiting configuration */
  rateLimit?: RateLimitConfig;
}

/**
 * Multi-adapter component definition
 */
export interface MultiAdapterComponent {
  react?: unknown;
  preact?: unknown;
  static?: unknown;
  [key: string]: unknown;
}

/**
 * Route context (similar to Fresh's Context)
 */
export interface RouteContext<TState = unknown> {
  /** Request URL */
  url: URL;
  /** Request object */
  req: Request;
  /** URL parameters */
  params: Record<string, string>;
  /** Query parameters */
  query: URLSearchParams;
  /** Route state */
  state: TState;
  /** Render response with view */
  render: (component: unknown) => Response;
}

/**
 * Middleware function
 */
export type Middleware<TState = unknown> = (
  ctx: RouteContext<TState>,
  next: () => Promise<Response>,
) => Response | Promise<Response>;

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Cache duration in seconds */
  ttl?: number;
  /** Cache key generator */
  key?: (ctx: RouteContext) => string;
  /** Whether to vary by query parameters */
  varyByQuery?: boolean;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  /** Requests per window */
  requests: number;
  /** Time window in seconds */
  window: number;
  /** Rate limit key generator */
  key?: (ctx: RouteContext) => string;
}

/**
 * Enhanced registry for Lime modules
 */
export class LimeRegistry {
  private routes: Map<string, { handler: RouteHandler; config: RouteConfig }> =
    new Map();
  private layouts: Map<string, { component: unknown; config: LayoutConfig }> =
    new Map();
  private islands: Map<
    string,
    { component: unknown | MultiAdapterComponent; config: IslandConfig }
  > = new Map();
  private serverComponents: Map<
    string,
    { component: unknown; config: ServerComponentConfig }
  > = new Map();
  private serverActions: Map<
    string,
    { action: unknown; config: ServerActionConfig }
  > = new Map();
  private middleware: Middleware[] = [];

  /**
   * Register a route handler
   */
  addRoute(
    path: string,
    handler: RouteHandler,
    config: RouteConfig = {},
  ): this {
    this.routes.set(path, { handler, config });
    return this;
  }

  /**
   * Register a layout component
   */
  addLayout(name: string, component: unknown, config: LayoutConfig = {}): this {
    this.layouts.set(name, { component, config });
    return this;
  }

  /**
   * Register an island component
   */
  addIsland(
    name: string,
    component: unknown | MultiAdapterComponent,
    config: IslandConfig,
  ): this {
    this.islands.set(name, { component, config });

    // Also register with the islands manager
    const islandId = `${name}_${Date.now()}`;
    const islandDef: IslandDefinition = {
      id: islandId,
      name,
      adapter: config.adapter,
      component,
      props: {}, // Will be set when rendering
      hydration: config.hydration || "idle",
      selector: `[data-island-id="${islandId}"]`,
      dependencies: [],
      meta: {
        priority: config.lazy ? 0 : 10,
      },
    };

    islandsManager.registerIsland(islandDef);

    return this;
  }

  /**
   * Register a React Server Component
   */
  addServerComponent(
    name: string,
    component: unknown,
    config: ServerComponentConfig = {},
  ): this {
    this.serverComponents.set(name, { component, config });
    return this;
  }

  /**
   * Register a React Server Action
   */
  addServerAction(
    name: string,
    action: unknown,
    config: ServerActionConfig = {},
  ): this {
    this.serverActions.set(name, { action, config });

    // Also register with the global server actions registry
    if (typeof action === "function") {
      const actionId = `${name}_${Date.now()}`;
      const definition: ServerActionDefinition = {
        id: actionId,
        name,
        handler: action as any, // Type assertion needed here
        component: "registry",
        file: "registry",
        meta: {
          description: `Server Action: ${name}`,
          rateLimit: config.rateLimit,
        },
      };

      serverActionsRegistry.register(definition);
    }

    return this;
  }

  /**
   * Register global middleware
   */
  addMiddleware(middleware: Middleware): this {
    this.middleware.push(middleware);
    return this;
  }

  /**
   * Get all registered routes
   */
  getRoutes(): Map<string, { handler: RouteHandler; config: RouteConfig }> {
    return this.routes;
  }

  /**
   * Get all registered layouts
   */
  getLayouts(): Map<string, { component: unknown; config: LayoutConfig }> {
    return this.layouts;
  }

  /**
   * Get all registered islands
   */
  getIslands(): Map<
    string,
    { component: unknown | MultiAdapterComponent; config: IslandConfig }
  > {
    return this.islands;
  }

  /**
   * Get all registered server components
   */
  getServerComponents(): Map<
    string,
    { component: unknown; config: ServerComponentConfig }
  > {
    return this.serverComponents;
  }

  /**
   * Get all registered server actions
   */
  getServerActions(): Map<
    string,
    { action: unknown; config: ServerActionConfig }
  > {
    return this.serverActions;
  }

  /**
   * Get all registered middleware
   */
  getMiddleware(): Middleware[] {
    return this.middleware;
  }

  /**
   * Export registry data for manifest generation
   */
  toManifest(): {
    routes: Array<{ path: string; handler: string; config: RouteConfig }>;
    layouts: Array<{ name: string; component: string; config: LayoutConfig }>;
    islands: Array<{ name: string; component: string; config: IslandConfig }>;
    serverComponents: Array<
      { name: string; component: string; config: ServerComponentConfig }
    >;
    serverActions: Array<
      { name: string; action: string; config: ServerActionConfig }
    >;
  } {
    return {
      routes: Array.from(this.routes.entries()).map(([path, { config }]) => ({
        path,
        handler: `handler_${path.replace(/[^\w]/g, "_")}`,
        config,
      })),
      layouts: Array.from(this.layouts.entries()).map(([name, { config }]) => ({
        name,
        component: `layout_${name}`,
        config,
      })),
      islands: Array.from(this.islands.entries()).map(([name, { config }]) => ({
        name,
        component: `island_${name}`,
        config,
      })),
      serverComponents: Array.from(this.serverComponents.entries()).map((
        [name, { config }],
      ) => ({
        name,
        component: `rsc_${name}`,
        config,
      })),
      serverActions: Array.from(this.serverActions.entries()).map((
        [name, { config }],
      ) => ({
        name,
        action: `action_${name}`,
        config,
      })),
    };
  }
}
