// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * React adapter with React 19 support (Server Components, Server Actions)
 */

import {
  type AdapterConfig,
  type HydrationContext,
  type RenderContext,
  ViewAdapter,
} from "./adapter.ts";
import { serverActionsRegistry } from "../server-actions.ts";

export interface ReactAdapterConfig extends AdapterConfig {
  name: "react";
  /** React version */
  version: string;
  /** Enable React Server Components */
  rsc?: boolean;
  /** Enable Server Actions */
  serverActions?: boolean;
  /** Enable Suspense streaming */
  streaming?: boolean;
  /** React import source */
  importSource?: string;
}

/**
 * React 19 adapter for Lime
 */
export class ReactAdapter extends ViewAdapter {
  readonly name = "react";
  readonly version = "19";
  readonly supportsSSR = true;
  readonly supportsStreaming = true;
  readonly supportsRSC = true;
  readonly supportsServerActions = true;

  private config!: ReactAdapterConfig;
  private React: any;
  private ReactDOMServer: any;
  private ReactDOM: any;

  async init(config: ReactAdapterConfig): Promise<void> {
    this.config = config;

    try {
      // Use specific version to avoid mismatches
      const reactVersion = "19.1.1"; // Use latest stable version
      const reactSource = config.importSource || `npm:react@${reactVersion}`;
      const reactDomSource = `npm:react-dom@${reactVersion}`;

      // Import React modules with same version
      this.React = await import(reactSource);
      this.ReactDOMServer = await import(`${reactDomSource}/server`);
      this.ReactDOM = await import(reactDomSource);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      // More helpful error message for version mismatches
      if (
        errorMessage.includes("Incompatible React versions") ||
        errorMessage.includes("version mismatch")
      ) {
        throw new Error(
          `React version mismatch detected. Please ensure react and react-dom have matching versions. ` +
            `Current error: ${errorMessage}`,
        );
      }

      throw new Error(`Failed to load React: ${errorMessage}`);
    }
  }

  async renderToString(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    if (!this.ReactDOMServer) {
      throw new Error("React adapter not initialized");
    }

    try {
      // For React Server Components, we need special handling
      if (this.isServerComponent(component)) {
        return await this.renderServerComponent(component, context);
      }

      // Regular SSR with Suspense support
      const element = this.createElement(component, context.props);

      // Wrap in Suspense if React 19 features are enabled
      if (this.config.streaming && this.React.Suspense) {
        const suspenseWrapper = this.React.createElement(
          this.React.Suspense,
          { fallback: this.React.createElement("div", null, "Loading...") },
          element,
        );
        return this.ReactDOMServer.renderToString(suspenseWrapper);
      }

      return this.ReactDOMServer.renderToString(element);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      throw new Error(`React SSR failed: ${errorMessage}`);
    }
  }

  renderToStream?(
    component: unknown,
    context: RenderContext,
  ): ReadableStream<Uint8Array> {
    if (!this.ReactDOMServer.renderToReadableStream) {
      throw new Error("React streaming not supported in this version");
    }

    const element = this.createElement(component, context.props);
    return this.ReactDOMServer.renderToReadableStream(element);
  }

  async renderToStaticMarkup(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    if (!this.ReactDOMServer) {
      throw new Error("React adapter not initialized");
    }

    const element = this.createElement(component, context.props);
    return this.ReactDOMServer.renderToStaticMarkup(element);
  }

  async hydrate(context: HydrationContext): Promise<void> {
    if (!this.ReactDOM) {
      throw new Error("React adapter not initialized");
    }

    try {
      const component = await this.resolveComponent(context.id);
      const element = this.createElement(component, context.props);

      // Use React 19's hydrateRoot
      if (this.ReactDOM.hydrateRoot) {
        this.ReactDOM.hydrateRoot(context.element, element);
      } else {
        // Fallback for older React versions
        this.ReactDOM.hydrate(element, context.element);
      }
    } catch (error) {
      throw new Error(`React hydration failed: ${error}`);
    }
  }

  async getClientBundle(): Promise<string> {
    // Generate client-side bundle for React
    const reactVersion = "19.1.1";
    return `
      import React from "${
      this.config.importSource || `npm:react@${reactVersion}`
    }";
      import ReactDOM from "npm:react-dom@${reactVersion}";

      window.__LIME_REACT_ADAPTER__ = {
        React,
        ReactDOM,
        hydrate: (id, component, props, element) => {
          const el = React.createElement(component, props);
          if (ReactDOM.hydrateRoot) {
            ReactDOM.hydrateRoot(element, el);
          } else {
            ReactDOM.hydrate(el, element);
          }
        }
      };
    `;
  }

  isCompatible(component: unknown): boolean {
    if (!component) return false;

    // Check for React component patterns
    if (typeof component === "function") {
      // Check for React function component
      const code = component.toString();
      return (
        code.includes("React.") ||
        code.includes("jsx") ||
        code.includes("createElement") ||
        code.includes("useState") ||
        code.includes("useEffect") ||
        this.hasReactHooks(code)
      );
    }

    // Check for React element
    if (typeof component === "object" && component !== null) {
      return "$$typeof" in component || "type" in component;
    }

    return false;
  }

  async cleanup(): Promise<void> {
    // Cleanup React-specific resources if needed
  }

  /**
   * Check if component is a React Server Component
   */
  isServerComponent(component: unknown): boolean {
    if (typeof component === "function") {
      const code = component.toString();
      return code.includes("'use server'") || code.includes('"use server"');
    }
    return false;
  }

  /**
   * Check if component uses React Client features
   */
  isClientComponent(component: unknown): boolean {
    if (typeof component === "function") {
      const code = component.toString();
      return code.includes("'use client'") || code.includes('"use client"');
    }
    return false;
  }

  /**
   * Render React Server Component
   */
  private async renderServerComponent(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    if (typeof component !== "function") {
      throw new Error("Invalid Server Component");
    }

    try {
      // Server Components can be async functions that return JSX
      const result = await component(context.props);

      if (typeof result === "string") {
        return result;
      }

      // Handle React elements
      if (this.isReactElement(result)) {
        return this.ReactDOMServer.renderToString(result);
      }

      // Handle nested Server Components
      if (typeof result === "function") {
        return await this.renderServerComponent(result, context);
      }

      // Handle promises (for concurrent features)
      if (result && typeof result.then === "function") {
        const resolvedResult = await result;
        return this.ReactDOMServer.renderToString(resolvedResult);
      }

      return this.ReactDOMServer.renderToString(result);
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      throw new Error(`Server Component render failed: ${errorMessage}`);
    }
  }

  /**
   * Check if value is a React element
   */
  private isReactElement(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      ("$$typeof" in value || "type" in value)
    );
  }

  /**
   * Handle Server Actions (React 19 forms)
   */
  async handleServerAction(
    actionId: string,
    formData: FormData,
    context: RenderContext,
  ): Promise<Response> {
    // Server Actions are functions marked with 'use server'
    // They can be called from forms and should return a response

    try {
      const action = await this.resolveServerAction(actionId);
      if (!action || typeof action !== "function") {
        throw new Error(`Server Action not found: ${actionId}`);
      }

      // Execute the server action
      const result = await action(formData, context);

      // Handle different response types
      if (result instanceof Response) {
        return result;
      }

      if (typeof result === "object" && result !== null) {
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(String(result), {
        headers: { "Content-Type": "text/plain" },
      });
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  /**
   * Generate Server Action endpoint
   */
  generateServerActionEndpoint(actionId: string): string {
    return `/__lime_server_action/${actionId}`;
  }

  /**
   * Extract Server Actions from component
   */
  extractServerActions(component: unknown): Map<string, unknown> {
    const actions = new Map<string, unknown>();

    if (typeof component === "function") {
      const code = component.toString();

      // Look for functions with 'use server' directive
      const serverActionRegex =
        /(?:function\s+(\w+)|const\s+(\w+)\s*=.*?)\s*=>\s*{\s*['"]use server['"]/g;
      let match;

      while ((match = serverActionRegex.exec(code)) !== null) {
        const actionName = match[1] || match[2];
        if (actionName) {
          // Generate unique action ID
          const actionId = `${
            component.name || "anonymous"
          }_${actionName}_${Date.now()}`;
          actions.set(actionId, { name: actionName, component });
        }
      }
    }

    return actions;
  }

  /**
   * Resolve server action by ID
   */
  private async resolveServerAction(actionId: string): Promise<unknown> {
    const actionDef = serverActionsRegistry.get(actionId);
    if (!actionDef) {
      throw new Error(`Server Action not found: ${actionId}`);
    }
    return actionDef.handler;
  }

  /**
   * Create React element from component and props
   */
  private createElement(component: unknown, props?: Record<string, unknown>) {
    if (!this.React) {
      throw new Error("React not loaded");
    }
    return this.React.createElement(component, props);
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
   * Check if code uses React hooks
   */
  private hasReactHooks(code: string): boolean {
    const hookPatterns = [
      /use[A-Z]\w*/, // Hook naming convention
      /React\.use[A-Z]/,
      /\buse(State|Effect|Context|Reducer|Memo|Callback|Ref|ImperativeHandle|LayoutEffect|DebugValue)\b/,
    ];

    return hookPatterns.some((pattern) => pattern.test(code));
  }
}
