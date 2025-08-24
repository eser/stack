// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Server Actions registry and handling for React 19 Server Actions
 */

import type { RenderContext } from "./adapters/adapter.ts";

export type ServerAction = (
  formData: FormData,
  context: RenderContext,
) => Promise<unknown>;

export interface ServerActionDefinition {
  id: string;
  name: string;
  handler: ServerAction;
  component: string;
  file: string;
  meta?: {
    description?: string;
    csrf?: boolean;
    rateLimit?: {
      requests: number;
      window: number; // seconds
    };
    [key: string]: unknown;
  };
}

/**
 * Registry for Server Actions
 */
export class ServerActionsRegistry {
  private actions = new Map<string, ServerActionDefinition>();
  private componentActions = new Map<string, Set<string>>();

  /**
   * Register a Server Action
   */
  register(definition: ServerActionDefinition): void {
    this.actions.set(definition.id, definition);

    // Track actions by component
    if (!this.componentActions.has(definition.component)) {
      this.componentActions.set(definition.component, new Set());
    }
    this.componentActions.get(definition.component)!.add(definition.id);
  }

  /**
   * Get a Server Action by ID
   */
  get(id: string): ServerActionDefinition | undefined {
    return this.actions.get(id);
  }

  /**
   * Get all Server Actions for a component
   */
  getByComponent(componentName: string): ServerActionDefinition[] {
    const actionIds = this.componentActions.get(componentName);
    if (!actionIds) return [];

    return Array.from(actionIds)
      .map((id) => this.actions.get(id))
      .filter((action): action is ServerActionDefinition =>
        action !== undefined
      );
  }

  /**
   * Get all registered Server Actions
   */
  getAll(): ServerActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * Check if a Server Action exists
   */
  has(id: string): boolean {
    return this.actions.has(id);
  }

  /**
   * Execute a Server Action
   */
  async execute(
    id: string,
    formData: FormData,
    context: RenderContext,
  ): Promise<Response> {
    const action = this.get(id);
    if (!action) {
      return new Response(
        JSON.stringify({ error: "Server Action not found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    try {
      // Execute the server action
      const result = await action.handler(formData, context);

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
   * Generate Server Action endpoint URL
   */
  getEndpoint(id: string): string {
    return `/__lime_server_action/${id}`;
  }

  /**
   * Extract Server Actions from source code
   */
  extractFromSource(
    source: string,
    componentName: string,
    file: string,
  ): ServerActionDefinition[] {
    const actions: ServerActionDefinition[] = [];

    // Regex to find functions with 'use server' directive
    const serverActionRegex =
      /(?:async\s+)?(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?[^=]*?)\s*[=(].*?{\s*['"]use server['"][;,\s]/gs;

    let match;
    while ((match = serverActionRegex.exec(source)) !== null) {
      const actionName = match[1] || match[2];
      if (actionName) {
        const actionId = `${componentName}_${actionName}_${
          this.generateHash(file + actionName)
        }`;

        actions.push({
          id: actionId,
          name: actionName,
          handler: this.createPlaceholderHandler(actionName), // Placeholder - real handler set later
          component: componentName,
          file,
          meta: {
            description: `Server Action: ${actionName}`,
          },
        });
      }
    }

    return actions;
  }

  /**
   * Generate action endpoint routes for Lime router
   */
  generateRoutes(): Array<
    { path: string; handler: (req: Request) => Promise<Response> }
  > {
    return Array.from(this.actions.keys()).map((actionId) => ({
      path: this.getEndpoint(actionId),
      handler: async (req: Request) => {
        if (req.method !== "POST") {
          return new Response("Method Not Allowed", { status: 405 });
        }

        try {
          const formData = await req.formData();
          const context: RenderContext = {
            url: new URL(req.url),
            req,
            mode: "ssr",
          };

          return await this.execute(actionId, formData, context);
        } catch (error) {
          const errorMessage = error instanceof Error
            ? error.message
            : String(error);
          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    }));
  }

  /**
   * Clear all registered Server Actions
   */
  clear(): void {
    this.actions.clear();
    this.componentActions.clear();
  }

  /**
   * Generate a hash for action ID uniqueness
   */
  private generateHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Create a placeholder handler (to be replaced with real implementation)
   */
  private createPlaceholderHandler(actionName: string): ServerAction {
    return async () => {
      throw new Error(`Server Action '${actionName}' handler not implemented`);
    };
  }
}

/**
 * Global Server Actions registry instance
 */
export const serverActionsRegistry = new ServerActionsRegistry();

/**
 * Server Actions middleware for handling POST requests
 */
export function createServerActionsMiddleware(
  registry: ServerActionsRegistry = serverActionsRegistry,
) {
  return async (
    req: Request,
    next: () => Promise<Response>,
  ): Promise<Response> => {
    const url = new URL(req.url);

    // Check if this is a Server Action request
    if (url.pathname.startsWith("/__lime_server_action/")) {
      const actionId = url.pathname.replace("/__lime_server_action/", "");

      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      try {
        const formData = await req.formData();
        const context: RenderContext = {
          url,
          req,
          mode: "ssr",
        };

        return await registry.execute(actionId, formData, context);
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

    // Not a Server Action request, continue with next middleware
    return next();
  };
}

/**
 * Utility to create Server Action form
 */
export function createServerActionForm(
  actionId: string,
  children: string,
): string {
  const endpoint = serverActionsRegistry.getEndpoint(actionId);

  return `
    <form action="${endpoint}" method="POST" enctype="multipart/form-data">
      ${children}
    </form>
  `;
}

/**
 * Server Action form helper for JSX
 */
export function ServerActionForm(props: {
  actionId: string;
  children: unknown;
  className?: string;
  [key: string]: unknown;
}) {
  const endpoint = serverActionsRegistry.getEndpoint(props.actionId);

  return {
    type: "form",
    props: {
      action: endpoint,
      method: "POST",
      encType: "multipart/form-data",
      className: props.className,
      children: props.children,
    },
  };
}
