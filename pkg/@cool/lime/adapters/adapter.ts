// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Base adapter interface for view libraries in Lime
 */

export interface AdapterConfig {
  /** Adapter name */
  name: string;
  /** Version requirements */
  version?: string;
  /** Additional configuration */
  [key: string]: unknown;
}

/**
 * Component rendering context
 */
export interface RenderContext {
  /** Request URL */
  url: URL;
  /** Request object */
  req: Request;
  /** Component props */
  props?: Record<string, unknown>;
  /** Render mode */
  mode: "ssr" | "ssg" | "client";
  /** Server component context */
  serverContext?: {
    /** Current user/session */
    user?: unknown;
    /** Database connections */
    db?: unknown;
    /** Other server-only resources */
    [key: string]: unknown;
  };
}

/**
 * Hydration context for client-side
 */
export interface HydrationContext {
  /** Component ID */
  id: string;
  /** Component props */
  props: Record<string, unknown>;
  /** DOM element to hydrate */
  element: Element;
  /** Hydration strategy */
  strategy: "idle" | "load" | "visible" | "media";
}

/**
 * Base view adapter interface
 */
export abstract class ViewAdapter {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly supportsSSR: boolean;
  abstract readonly supportsStreaming: boolean;
  abstract readonly supportsRSC: boolean;
  abstract readonly supportsServerActions: boolean;

  /**
   * Initialize the adapter with configuration
   */
  abstract init(config: AdapterConfig): Promise<void>;

  /**
   * Render component to string (SSR)
   */
  abstract renderToString(
    component: unknown,
    context: RenderContext,
  ): Promise<string>;

  /**
   * Render component to stream (SSR with streaming)
   */
  abstract renderToStream?(
    component: unknown,
    context: RenderContext,
  ): ReadableStream<Uint8Array>;

  /**
   * Render component to static markup (SSG)
   */
  abstract renderToStaticMarkup?(
    component: unknown,
    context: RenderContext,
  ): Promise<string>;

  /**
   * Hydrate component on client-side
   */
  abstract hydrate(context: HydrationContext): Promise<void>;

  /**
   * Get client-side bundle for this adapter
   */
  abstract getClientBundle(): Promise<string>;

  /**
   * Validate if a component is compatible with this adapter
   */
  abstract isCompatible(component: unknown): boolean;

  /**
   * Transform component for this adapter if needed
   */
  abstract transform?(component: unknown): unknown;

  /**
   * Handle Server Actions (React 19 feature)
   */
  handleServerAction?(
    actionId: string,
    formData: FormData,
    context: RenderContext,
  ): Promise<Response>;

  /**
   * Extract Server Actions from component
   */
  extractServerActions?(component: unknown): Map<string, unknown>;

  /**
   * Check if component is a Server Component
   */
  isServerComponent?(component: unknown): boolean;

  /**
   * Check if component is a Client Component
   */
  isClientComponent?(component: unknown): boolean;

  /**
   * Cleanup resources
   */
  abstract cleanup(): Promise<void>;
}

/**
 * Adapter registry
 */
export class AdapterRegistry {
  private adapters = new Map<string, ViewAdapter>();
  private defaultAdapter?: string;

  /**
   * Register an adapter
   */
  register(adapter: ViewAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Get an adapter by name
   */
  get(name: string): ViewAdapter | undefined {
    return this.adapters.get(name);
  }

  /**
   * Get default adapter
   */
  getDefault(): ViewAdapter | undefined {
    if (!this.defaultAdapter) return undefined;
    return this.get(this.defaultAdapter);
  }

  /**
   * Set default adapter
   */
  setDefault(name: string): void {
    if (!this.adapters.has(name)) {
      throw new Error(`Adapter '${name}' not found`);
    }
    this.defaultAdapter = name;
  }

  /**
   * Get all registered adapters
   */
  getAll(): Map<string, ViewAdapter> {
    return new Map(this.adapters);
  }

  /**
   * Check if adapter exists
   */
  has(name: string): boolean {
    return this.adapters.has(name);
  }

  /**
   * Find best adapter for component
   */
  findBestAdapter(component: unknown): ViewAdapter | undefined {
    // Check if component has adapter hint
    if (component && typeof component === "object" && "adapter" in component) {
      const hintedAdapter = this.get(component.adapter as string);
      if (hintedAdapter && hintedAdapter.isCompatible(component)) {
        return hintedAdapter;
      }
    }

    // Find first compatible adapter
    for (const adapter of this.adapters.values()) {
      if (adapter.isCompatible(component)) {
        return adapter;
      }
    }

    // Fall back to default adapter
    return this.getDefault();
  }
}

/**
 * Global adapter registry instance
 */
export const adapterRegistry = new AdapterRegistry();
