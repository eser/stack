// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Static HTML adapter for Lime - renders pure HTML with no JavaScript
 */

import {
  type AdapterConfig,
  type HydrationContext,
  type RenderContext,
  ViewAdapter,
} from "./adapter.ts";

export interface StaticAdapterConfig extends AdapterConfig {
  name: "static";
  /** HTML optimization level */
  optimize?: boolean;
  /** Pretty print HTML */
  pretty?: boolean;
}

/**
 * Static HTML adapter - renders pure HTML without JavaScript
 */
export class StaticAdapter extends ViewAdapter {
  readonly name = "static";
  readonly version = "1.0";
  readonly supportsSSR = true;
  readonly supportsStreaming = false;
  readonly supportsRSC = false;
  readonly supportsServerActions = false;

  private config!: StaticAdapterConfig;

  async init(config: StaticAdapterConfig): Promise<void> {
    this.config = config;
    // Static adapter doesn't need external dependencies
  }

  async renderToString(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    try {
      const html = await this.renderComponent(component, context.props);
      return this.optimizeHtml(html);
    } catch (error) {
      throw new Error(`Static render failed: ${error}`);
    }
  }

  async renderToStaticMarkup(
    component: unknown,
    context: RenderContext,
  ): Promise<string> {
    // For static adapter, this is the same as renderToString
    return this.renderToString(component, context);
  }

  async hydrate(context: HydrationContext): Promise<void> {
    // Static components don't hydrate - they're just HTML
    // This is a no-op
  }

  async getClientBundle(): Promise<string> {
    // Static components don't need client-side JavaScript
    return `
      window.__LIME_STATIC_ADAPTER__ = {
        // No-op hydration for static components
        hydrate: () => {}
      };
    `;
  }

  isCompatible(component: unknown): boolean {
    if (!component) return true; // Empty component is valid static

    // Check for static component patterns
    if (typeof component === "function") {
      const code = component.toString();

      // Not compatible if it uses client-side features
      const hasClientFeatures = code.includes("useState") ||
        code.includes("useEffect") ||
        code.includes("onClick") ||
        code.includes("onChange") ||
        code.includes("onSubmit") ||
        code.includes("addEventListener") ||
        code.includes("window.") ||
        code.includes("document.");

      return !hasClientFeatures;
    }

    // String content is always static compatible
    if (typeof component === "string") return true;

    // Check for static object structures
    if (typeof component === "object" && component !== null) {
      return this.isStaticObject(component);
    }

    return true;
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for static adapter
  }

  /**
   * Render component to HTML string
   */
  private async renderComponent(
    component: unknown,
    props?: Record<string, unknown>,
  ): Promise<string> {
    if (typeof component === "string") {
      return component;
    }

    if (typeof component === "function") {
      try {
        const result = await component(props || {});
        if (typeof result === "string") {
          return result;
        }
        // If function returns JSX-like object, render it
        return this.renderJSXToHTML(result);
      } catch (error) {
        return `<!-- Error rendering component: ${error} -->`;
      }
    }

    if (typeof component === "object" && component !== null) {
      return this.renderJSXToHTML(component);
    }

    return String(component);
  }

  /**
   * Convert JSX-like object to HTML string
   */
  private renderJSXToHTML(jsx: any): string {
    if (!jsx) return "";

    if (typeof jsx === "string" || typeof jsx === "number") {
      return this.escapeHtml(String(jsx));
    }

    if (Array.isArray(jsx)) {
      return jsx.map((child) => this.renderJSXToHTML(child)).join("");
    }

    if (typeof jsx === "object" && jsx.type) {
      const { type, props } = jsx;

      // Handle HTML elements
      if (typeof type === "string") {
        return this.renderHTMLElement(type, props);
      }

      // Handle component functions
      if (typeof type === "function") {
        const result = type(props);
        return this.renderJSXToHTML(result);
      }
    }

    return String(jsx);
  }

  /**
   * Render HTML element with props and children
   */
  private renderHTMLElement(tag: string, props: any): string {
    const { children, ...attributes } = props || {};

    // Self-closing tags
    const selfClosing = [
      "area",
      "base",
      "br",
      "col",
      "embed",
      "hr",
      "img",
      "input",
      "link",
      "meta",
      "param",
      "source",
      "track",
      "wbr",
    ];

    // Build attributes string
    const attrs = this.buildAttributes(attributes);

    if (selfClosing.includes(tag)) {
      return `<${tag}${attrs} />`;
    }

    const childrenHTML = children ? this.renderJSXToHTML(children) : "";
    return `<${tag}${attrs}>${childrenHTML}</${tag}>`;
  }

  /**
   * Build HTML attributes string from props
   */
  private buildAttributes(attributes: Record<string, unknown>): string {
    if (!attributes) return "";

    return Object.entries(attributes)
      .filter(([key, value]) => {
        // Filter out undefined, null, false values and event handlers
        return value != null &&
          value !== false &&
          !key.startsWith("on") &&
          key !== "children";
      })
      .map(([key, value]) => {
        // Handle boolean attributes
        if (value === true) return key;

        // Handle className -> class
        const attrName = key === "className" ? "class" : key;

        // Escape attribute value
        const escaped = this.escapeHtml(String(value));
        return `${attrName}="${escaped}"`;
      })
      .join(" ")
      .replace(/^/, " "); // Add leading space if attributes exist
  }

  /**
   * Escape HTML entities
   */
  private escapeHtml(text: string): string {
    const htmlEntities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return text.replace(/[&<>"']/g, (match) => htmlEntities[match]);
  }

  /**
   * Optimize generated HTML
   */
  private optimizeHtml(html: string): string {
    if (!this.config.optimize) {
      return this.config.pretty ? this.prettifyHtml(html) : html;
    }

    // Basic optimization: remove extra whitespace
    let optimized = html
      .replace(/>\s+</g, "><") // Remove whitespace between tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();

    return this.config.pretty ? this.prettifyHtml(optimized) : optimized;
  }

  /**
   * Pretty print HTML
   */
  private prettifyHtml(html: string): string {
    // Basic pretty printing - add newlines and indentation
    let indent = 0;
    const indentSize = 2;

    return html
      .replace(/></g, ">\n<")
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return "";

        if (trimmed.startsWith("</")) indent--;
        const indented = " ".repeat(Math.max(0, indent * indentSize)) + trimmed;
        if (
          trimmed.startsWith("<") && !trimmed.startsWith("</") &&
          !trimmed.endsWith("/>")
        ) {
          indent++;
        }

        return indented;
      })
      .join("\n");
  }

  /**
   * Check if object is static (no client-side behavior)
   */
  private isStaticObject(obj: any): boolean {
    // Check for event handlers or client-side properties
    const clientProps = [
      "onClick",
      "onChange",
      "onSubmit",
      "onLoad",
      "onFocus",
      "onBlur",
    ];

    if (obj.props) {
      for (const prop of clientProps) {
        if (prop in obj.props) return false;
      }
    }

    return true;
  }
}
