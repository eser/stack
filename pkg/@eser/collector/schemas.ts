// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Schema definitions for web framework manifests
 * These schemas define the structure for routes, islands, layouts, and components
 */

export type ViewAdapter =
  | "react"
  | "preact"
  | "static"
  | "vue"
  | "solid"
  | "svelte";

export type HydrationStrategy =
  | "eager" // Hydrate immediately on page load
  | "idle" // Hydrate when main thread is idle
  | "visible" // Hydrate when component enters viewport
  | "media" // Hydrate based on media query
  | "load" // Hydrate on window load event
  | "none"; // Never hydrate (static only)

export type ComponentType =
  | "server" // Server-side only (RSC)
  | "client" // Client-side only
  | "universal" // Both server and client
  | "static"; // Static HTML only

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS";

/**
 * Route definition schema
 */
export interface RouteSchema {
  /** URL pattern with optional parameters (e.g., "/users/:id") */
  path: string;

  /** File path relative to base directory */
  file: string;

  /** Export name of the route handler */
  handler: string;

  /** View adapter for rendering this route */
  adapter?: ViewAdapter;

  /** Layout component to wrap this route */
  layout?: string;

  /** HTTP methods this route responds to */
  methods?: HttpMethod[];

  /** Middleware to apply to this route */
  middleware?: string[];

  /** Route metadata */
  meta?: {
    title?: string;
    description?: string;
    keywords?: string[];
    [key: string]: unknown;
  };

  /** Route-specific configuration */
  config?: {
    /** Cache control headers */
    cache?: {
      maxAge?: number;
      staleWhileRevalidate?: number;
      public?: boolean;
    };

    /** CORS configuration */
    cors?: {
      origin?: string | string[] | boolean;
      credentials?: boolean;
      methods?: HttpMethod[];
    };

    /** Rate limiting */
    rateLimit?: {
      requests?: number;
      window?: number; // seconds
    };

    [key: string]: unknown;
  };
}

/**
 * Island component schema
 */
export interface IslandSchema {
  /** Unique island name */
  name: string;

  /** File path relative to base directory */
  file: string;

  /** Export name of the island component */
  component: string;

  /** View adapter for this island */
  adapter: ViewAdapter;

  /** Expected props for this island */
  props?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    default?: unknown;
  }>;

  /** Hydration strategy */
  hydration?: HydrationStrategy;

  /** Media query for conditional hydration */
  media?: string;

  /** Dependencies this island requires */
  dependencies?: string[];

  /** Island metadata */
  meta?: {
    description?: string;
    category?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Layout component schema
 */
export interface LayoutSchema {
  /** Layout name */
  name: string;

  /** File path relative to base directory */
  file: string;

  /** Export name of the layout component */
  component: string;

  /** View adapter for this layout */
  adapter?: ViewAdapter;

  /** Props this layout accepts */
  props?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    default?: unknown;
  }>;

  /** Nested layout (parent layout) */
  extends?: string;

  /** Layout metadata */
  meta?: {
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Middleware schema
 */
export interface MiddlewareSchema {
  /** Middleware name */
  name: string;

  /** File path relative to base directory */
  file: string;

  /** Export name of the middleware handler */
  handler: string;

  /** Execution priority (lower = earlier) */
  priority?: number;

  /** URL patterns this middleware applies to */
  patterns?: string[];

  /** Middleware configuration */
  config?: {
    [key: string]: unknown;
  };

  /** Middleware metadata */
  meta?: {
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Component schema
 */
export interface ComponentSchema {
  /** Component name */
  name: string;

  /** File path relative to base directory */
  file: string;

  /** Export name of the component */
  component: string;

  /** View adapter for this component */
  adapter?: ViewAdapter;

  /** Component type */
  type?: ComponentType;

  /** Props this component accepts */
  props?: Array<{
    name: string;
    type?: string;
    required?: boolean;
    default?: unknown;
  }>;

  /** Dependencies this component requires */
  dependencies?: string[];

  /** Component metadata */
  meta?: {
    description?: string;
    category?: string;
    tags?: string[];
    [key: string]: unknown;
  };
}

/**
 * Complete web framework manifest schema
 */
export interface WebFrameworkManifestSchema {
  /** Base URL for the application */
  baseUrl: string;

  /** Application metadata */
  app?: {
    name?: string;
    version?: string;
    description?: string;
    [key: string]: unknown;
  };

  /** Global configuration */
  config?: {
    /** Default view adapter */
    defaultAdapter?: ViewAdapter;

    /** Global middleware */
    middleware?: string[];

    /** Error handling */
    errorHandling?: {
      /** Custom error pages */
      pages?: {
        404?: string;
        500?: string;
        [statusCode: string]: string;
      };

      /** Development mode settings */
      development?: {
        showErrors?: boolean;
        hotReload?: boolean;
      };
    };

    /** Static asset configuration */
    assets?: {
      /** Base URL for static assets */
      baseUrl?: string;

      /** Cache control for assets */
      cache?: {
        maxAge?: number;
        immutable?: boolean;
      };
    };

    [key: string]: unknown;
  };

  /** Route definitions */
  routes: RouteSchema[];

  /** Island component definitions */
  islands: IslandSchema[];

  /** Layout component definitions */
  layouts: LayoutSchema[];

  /** Middleware definitions */
  middleware: MiddlewareSchema[];

  /** Reusable component definitions */
  components: ComponentSchema[];
}

/**
 * Manifest validation functions
 */
export class ManifestValidator {
  static validateRoute(route: unknown): route is RouteSchema {
    if (typeof route !== "object" || route === null) return false;

    const r = route as Partial<RouteSchema>;
    return (
      typeof r.path === "string" &&
      typeof r.file === "string" &&
      typeof r.handler === "string"
    );
  }

  static validateIsland(island: unknown): island is IslandSchema {
    if (typeof island !== "object" || island === null) return false;

    const i = island as Partial<IslandSchema>;
    return (
      typeof i.name === "string" &&
      typeof i.file === "string" &&
      typeof i.component === "string" &&
      typeof i.adapter === "string"
    );
  }

  static validateLayout(layout: unknown): layout is LayoutSchema {
    if (typeof layout !== "object" || layout === null) return false;

    const l = layout as Partial<LayoutSchema>;
    return (
      typeof l.name === "string" &&
      typeof l.file === "string" &&
      typeof l.component === "string"
    );
  }

  static validateMiddleware(
    middleware: unknown,
  ): middleware is MiddlewareSchema {
    if (typeof middleware !== "object" || middleware === null) return false;

    const m = middleware as Partial<MiddlewareSchema>;
    return (
      typeof m.name === "string" &&
      typeof m.file === "string" &&
      typeof m.handler === "string"
    );
  }

  static validateComponent(component: unknown): component is ComponentSchema {
    if (typeof component !== "object" || component === null) return false;

    const c = component as Partial<ComponentSchema>;
    return (
      typeof c.name === "string" &&
      typeof c.file === "string" &&
      typeof c.component === "string"
    );
  }

  static validateManifest(
    manifest: unknown,
  ): manifest is WebFrameworkManifestSchema {
    if (typeof manifest !== "object" || manifest === null) return false;

    const m = manifest as Partial<WebFrameworkManifestSchema>;
    return (
      typeof m.baseUrl === "string" &&
      Array.isArray(m.routes) &&
      Array.isArray(m.islands) &&
      Array.isArray(m.layouts) &&
      Array.isArray(m.middleware) &&
      Array.isArray(m.components) &&
      m.routes.every(this.validateRoute) &&
      m.islands.every(this.validateIsland) &&
      m.layouts.every(this.validateLayout) &&
      m.middleware.every(this.validateMiddleware) &&
      m.components.every(this.validateComponent)
    );
  }
}

/**
 * Manifest builder utilities
 */
export class ManifestBuilder {
  private manifest: WebFrameworkManifestSchema;

  constructor(baseUrl: string) {
    this.manifest = {
      baseUrl,
      routes: [],
      islands: [],
      layouts: [],
      middleware: [],
      components: [],
    };
  }

  setApp(app: NonNullable<WebFrameworkManifestSchema["app"]>): this {
    this.manifest.app = app;
    return this;
  }

  setConfig(config: NonNullable<WebFrameworkManifestSchema["config"]>): this {
    this.manifest.config = config;
    return this;
  }

  addRoute(route: RouteSchema): this {
    this.manifest.routes.push(route);
    return this;
  }

  addIsland(island: IslandSchema): this {
    this.manifest.islands.push(island);
    return this;
  }

  addLayout(layout: LayoutSchema): this {
    this.manifest.layouts.push(layout);
    return this;
  }

  addMiddleware(middleware: MiddlewareSchema): this {
    this.manifest.middleware.push(middleware);
    return this;
  }

  addComponent(component: ComponentSchema): this {
    this.manifest.components.push(component);
    return this;
  }

  build(): WebFrameworkManifestSchema {
    return { ...this.manifest };
  }

  validate(): boolean {
    return ManifestValidator.validateManifest(this.manifest);
  }
}
