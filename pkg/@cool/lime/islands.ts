// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Multi-framework Islands architecture implementation for Lime
 * Handles selective hydration of React, Preact, and other framework components
 */

import type { ViewAdapter } from "./adapters/adapter.ts";
import { adapterRegistry } from "./adapters/adapter.ts";

export type IslandHydrationStrategy =
  | "eager" // Hydrate immediately on page load
  | "idle" // Hydrate when main thread is idle
  | "visible" // Hydrate when component enters viewport
  | "media" // Hydrate based on media query
  | "load" // Hydrate on window load event
  | "none"; // Never hydrate (static only)

export interface IslandDefinition {
  /** Unique island identifier */
  id: string;

  /** Island name */
  name: string;

  /** View adapter to use for this island */
  adapter: string;

  /** Island component */
  component: unknown;

  /** Props to pass to the island */
  props: Record<string, unknown>;

  /** Hydration strategy */
  hydration: IslandHydrationStrategy;

  /** CSS selector for the DOM element to hydrate */
  selector: string;

  /** Media query for conditional hydration */
  media?: string;

  /** Dependencies this island requires */
  dependencies?: string[];

  /** Island metadata */
  meta?: {
    priority?: number;
    [key: string]: unknown;
  };
}

export interface IslandBundle {
  /** Bundle identifier */
  id: string;

  /** View adapter name */
  adapter: string;

  /** JavaScript code for this bundle */
  code: string;

  /** CSS styles for this bundle */
  styles?: string;

  /** Islands included in this bundle */
  islands: string[];

  /** Bundle size in bytes */
  size: number;
}

export interface PageIslandManifest {
  /** Page identifier */
  pageId: string;

  /** Islands on this page */
  islands: IslandDefinition[];

  /** Bundles required for this page */
  bundles: IslandBundle[];

  /** Hydration order */
  hydrationOrder: string[];
}

/**
 * Islands manager for multi-framework hydration
 */
export class IslandsManager {
  private islands = new Map<string, IslandDefinition>();
  private bundles = new Map<string, IslandBundle>();
  private pageManifests = new Map<string, PageIslandManifest>();

  /**
   * Register an island
   */
  registerIsland(definition: IslandDefinition): void {
    this.islands.set(definition.id, definition);
  }

  /**
   * Get an island by ID
   */
  getIsland(id: string): IslandDefinition | undefined {
    return this.islands.get(id);
  }

  /**
   * Get all islands for a specific adapter
   */
  getIslandsByAdapter(adapterName: string): IslandDefinition[] {
    return Array.from(this.islands.values())
      .filter((island) => island.adapter === adapterName);
  }

  /**
   * Create a page manifest with islands and their bundles
   */
  async createPageManifest(
    pageId: string,
    islandIds: string[],
  ): Promise<PageIslandManifest> {
    const pageIslands = islandIds
      .map((id) => this.islands.get(id))
      .filter((island): island is IslandDefinition => island !== undefined);

    // Group islands by adapter
    const islandsByAdapter = new Map<string, IslandDefinition[]>();
    for (const island of pageIslands) {
      if (!islandsByAdapter.has(island.adapter)) {
        islandsByAdapter.set(island.adapter, []);
      }
      islandsByAdapter.get(island.adapter)!.push(island);
    }

    // Generate bundles for each adapter
    const bundles: IslandBundle[] = [];
    for (const [adapterName, islands] of islandsByAdapter) {
      const adapter = adapterRegistry.get(adapterName);
      if (adapter) {
        const bundle = await this.createAdapterBundle(adapterName, islands);
        bundles.push(bundle);
      }
    }

    // Determine hydration order based on priority and strategy
    const hydrationOrder = this.calculateHydrationOrder(pageIslands);

    const manifest: PageIslandManifest = {
      pageId,
      islands: pageIslands,
      bundles,
      hydrationOrder,
    };

    this.pageManifests.set(pageId, manifest);
    return manifest;
  }

  /**
   * Create a client-side bundle for an adapter
   */
  private async createAdapterBundle(
    adapterName: string,
    islands: IslandDefinition[],
  ): Promise<IslandBundle> {
    const adapter = adapterRegistry.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter '${adapterName}' not found`);
    }

    // Get the base client bundle from the adapter
    const adapterBundle = await adapter.getClientBundle();

    // Generate island-specific hydration code
    const islandCode = this.generateIslandHydrationCode(islands, adapter);

    const fullCode = `${adapterBundle}\n${islandCode}`;

    const bundleId = `${adapterName}_${this.generateBundleHash(fullCode)}`;

    const bundle: IslandBundle = {
      id: bundleId,
      adapter: adapterName,
      code: fullCode,
      islands: islands.map((i) => i.id),
      size: new TextEncoder().encode(fullCode).length,
    };

    this.bundles.set(bundleId, bundle);
    return bundle;
  }

  /**
   * Generate island-specific hydration code
   */
  private generateIslandHydrationCode(
    islands: IslandDefinition[],
    adapter: ViewAdapter,
  ): string {
    const hydrationCode = islands.map((island) => {
      return `
// Island: ${island.name} (${island.id})
(function() {
  const hydrateIsland = async () => {
    const element = document.querySelector('${island.selector}');
    if (!element) return;

    const props = ${JSON.stringify(island.props)};
    const context = {
      id: '${island.id}',
      props,
      element,
      strategy: '${island.hydration}'
    };

    try {
      // Use adapter-specific hydration
      if (window.__LIME_${adapter.name.toUpperCase()}_ADAPTER__) {
        await window.__LIME_${adapter.name.toUpperCase()}_ADAPTER__.hydrate(context);
      }
    } catch (error) {
      console.error('Failed to hydrate island ${island.id}:', error);
    }
  };

  // Apply hydration strategy
  ${this.generateHydrationStrategyCode(island)}
})();`;
    }).join("\n");

    return hydrationCode;
  }

  /**
   * Generate hydration strategy code
   */
  private generateHydrationStrategyCode(island: IslandDefinition): string {
    switch (island.hydration) {
      case "eager":
        return "hydrateIsland();";

      case "idle":
        return `
          if (window.requestIdleCallback) {
            window.requestIdleCallback(hydrateIsland);
          } else {
            setTimeout(hydrateIsland, 0);
          }`;

      case "visible":
        return `
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                hydrateIsland();
                observer.disconnect();
              }
            });
          });
          const element = document.querySelector('${island.selector}');
          if (element) observer.observe(element);`;

      case "media":
        return `
          ${
          island.media
            ? `
            const mediaQuery = window.matchMedia('${island.media}');
            if (mediaQuery.matches) {
              hydrateIsland();
            } else {
              mediaQuery.addEventListener('change', (e) => {
                if (e.matches) hydrateIsland();
              });
            }
          `
            : "hydrateIsland();"
        }`;

      case "load":
        return `
          if (document.readyState === 'complete') {
            hydrateIsland();
          } else {
            window.addEventListener('load', hydrateIsland);
          }`;

      default:
        return "// No hydration - static only";
    }
  }

  /**
   * Calculate hydration order based on priority and dependencies
   */
  private calculateHydrationOrder(islands: IslandDefinition[]): string[] {
    // Sort by priority (higher priority first)
    const sorted = islands.slice().sort((a, b) => {
      const priorityA = a.meta?.priority ?? 0;
      const priorityB = b.meta?.priority ?? 0;
      return priorityB - priorityA;
    });

    // TODO: Add dependency resolution logic here

    return sorted.map((island) => island.id);
  }

  /**
   * Generate HTML for island hydration scripts
   */
  generateHydrationHTML(pageId: string): string {
    const manifest = this.pageManifests.get(pageId);
    if (!manifest) return "";

    const scripts = manifest.bundles.map((bundle) => {
      return `<script type="module" data-island-bundle="${bundle.id}">
${bundle.code}
</script>`;
    }).join("\n");

    return scripts;
  }

  /**
   * Render island as static HTML with hydration markers
   */
  async renderIslandHTML(island: IslandDefinition): Promise<string> {
    const adapter = adapterRegistry.get(island.adapter);
    if (!adapter) {
      throw new Error(`Adapter '${island.adapter}' not found`);
    }

    // Render to static markup
    const html = await adapter.renderToStaticMarkup?.(island.component, {
      url: new URL("http://localhost"), // Placeholder
      req: new Request("http://localhost"), // Placeholder
      props: island.props,
      mode: "ssr",
    });

    if (!html) {
      return `<div data-island-id="${island.id}" data-island-adapter="${island.adapter}"></div>`;
    }

    // Add hydration markers
    return html.replace(
      /^<([^>]+)>/,
      `<$1 data-island-id="${island.id}" data-island-adapter="${island.adapter}">`,
    );
  }

  /**
   * Generate bundle hash for caching
   */
  private generateBundleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get page manifest
   */
  getPageManifest(pageId: string): PageIslandManifest | undefined {
    return this.pageManifests.get(pageId);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.islands.clear();
    this.bundles.clear();
    this.pageManifests.clear();
  }
}

/**
 * Global islands manager instance
 */
export const islandsManager = new IslandsManager();

/**
 * Island component wrapper for JSX
 */
export function Island(props: {
  name: string;
  adapter: string;
  component: unknown;
  hydration?: IslandHydrationStrategy;
  props?: Record<string, unknown>;
  media?: string;
  [key: string]: unknown;
}) {
  const islandId = `island_${props.name}_${Date.now()}`;

  // Register the island
  islandsManager.registerIsland({
    id: islandId,
    name: props.name,
    adapter: props.adapter,
    component: props.component,
    props: props.props || {},
    hydration: props.hydration || "idle",
    selector: `[data-island-id="${islandId}"]`,
    media: props.media,
  });

  // Return placeholder that will be replaced with actual HTML
  return {
    type: "div",
    props: {
      "data-island-id": islandId,
      "data-island-adapter": props.adapter,
      "data-island-hydration": props.hydration,
      children: props.children || null,
    },
  };
}
