// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Preact adapter for Lime
 */

import {
  type AdapterConfig,
  type HydrationContext,
  type RenderContext,
  ViewAdapter,
} from "./adapter.ts";

export interface PreactAdapterConfig extends AdapterConfig {
  name: "preact";
  /** Preact version */
  version: string;
  /** Enable Preact Signals */
  signals?: boolean;
  /** Enable compat mode for React compatibility */
  compat?: boolean;
  /** Preact import source */
  importSource?: string;
}

/**
 * Preact adapter for Lime
 */
export class PreactAdapter extends ViewAdapter {
  readonly name = "preact";
  readonly version = "10";
  readonly supportsSSR = true;
  readonly supportsStreaming = false; // Preact doesn't support streaming yet
  readonly supportsRSC = false; // No RSC support
  readonly supportsServerActions = false; // No Server Actions

  private config!: PreactAdapterConfig;
  private preact: any;
  private preactRenderToString: any;
  private preactHydrate: any;

  async init(config: PreactAdapterConfig): Promise<void> {
    this.config = config;

    // Dynamically import Preact based on configuration
    const importSource = config.importSource || "npm:preact@10";

    try {
      // Import Preact modules
      this.preact = await import(importSource);

      // Import render-to-string
      this.preactRenderToString = await import("npm:preact-render-to-string@6");

      // For hydration, we can use preact/compat or regular preact
      if (config.compat) {
        this.preactHydrate = await import("npm:preact@10/compat");
      } else {
        this.preactHydrate = this.preact;
      }
    } catch (error) {
      throw new Error(`Failed to load Preact: ${error}`);
    }
  }

  async renderToString(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    if (!this.preactRenderToString) {
      throw new Error("Preact adapter not initialized");
    }

    try {
      const element = this.createElement(component, context.props);
      return this.preactRenderToString.render(element);
    } catch (error) {
      throw new Error(`Preact SSR failed: ${error}`);
    }
  }

  async renderToStaticMarkup(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    // Preact's render is already static by default
    return this.renderToString(component, context);
  }

  async hydrate(context: HydrationContext): Promise<void> {
    if (!this.preactHydrate) {
      throw new Error("Preact adapter not initialized");
    }

    try {
      const component = await this.resolveComponent(context.id);
      const element = this.createElement(component, context.props);

      // Use Preact's hydrate function
      this.preactHydrate.hydrate(element, context.element);
    } catch (error) {
      throw new Error(`Preact hydration failed: ${error}`);
    }
  }

  async getClientBundle(): Promise<string> {
    // Generate client-side bundle for Preact
    const compatImport = this.config.compat
      ? `import { hydrate } from "${
        this.config.importSource || "npm:preact@10"
      }/compat";`
      : `import { hydrate } from "${
        this.config.importSource || "npm:preact@10"
      }";`;

    return `
      import { h } from "${this.config.importSource || "npm:preact@10"}";
      ${compatImport}

      window.__LIME_PREACT_ADAPTER__ = {
        h,
        hydrate: (id, component, props, element) => {
          const el = h(component, props);
          hydrate(el, element);
        }
      };
    `;
  }

  isCompatible(component: unknown): boolean {
    if (!component) return false;

    // Check for Preact component patterns
    if (typeof component === "function") {
      const code = component.toString();
      return (
        code.includes("h(") ||
        code.includes("preact") ||
        code.includes("signal(") ||
        code.includes("useSignal") ||
        // Also compatible with React patterns if compat mode
        (this.config.compat && this.hasReactPatterns(code))
      );
    }

    // Check for Preact VNode
    if (typeof component === "object" && component !== null) {
      return "type" in component && "props" in component;
    }

    return false;
  }

  transform?(component: unknown): unknown {
    // Transform React components to Preact if compat mode is enabled
    if (this.config.compat && typeof component === "function") {
      const code = component.toString();
      if (this.hasReactPatterns(code)) {
        // In compat mode, Preact handles React patterns automatically
        return component;
      }
    }
    return component;
  }

  async cleanup(): Promise<void> {
    // Cleanup Preact-specific resources if needed
  }

  /**
   * Create Preact element from component and props
   */
  private createElement(component: unknown, props?: Record<string, unknown>) {
    if (!this.preact) {
      throw new Error("Preact not loaded");
    }
    return this.preact.h(component, props);
  }

  /**
   * Resolve component by ID (for hydration)
   */
  private async resolveComponent(id: string): Promise<unknown> {
    // This would resolve components from the component registry
    // For now, we'll throw an error indicating this needs implementation
    throw new Error(`Component resolution not implemented: ${id}`);
  }

  /**
   * Check if code uses React patterns
   */
  private hasReactPatterns(code: string): boolean {
    const reactPatterns = [
      /React\./,
      /createElement/,
      /jsx/,
      /use[A-Z]\w*/, // React hooks
      /\buse(State|Effect|Context|Reducer|Memo|Callback|Ref)\b/,
    ];

    return reactPatterns.some((pattern) => pattern.test(code));
  }

  /**
   * Check if component uses Preact Signals
   */
  private usesSignals(component: unknown): boolean {
    if (typeof component === "function") {
      const code = component.toString();
      return code.includes("signal(") || code.includes("useSignal");
    }
    return false;
  }
}
