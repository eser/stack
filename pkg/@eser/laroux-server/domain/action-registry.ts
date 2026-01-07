// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Server Action Registry
 * Manages registration and invocation of server actions
 *
 * @deprecated This module is deprecated. Use React 19's native server actions instead.
 *
 * With the new system:
 * 1. Add "use server" directive at the top of your action file
 * 2. Export async functions directly
 * 3. Import and use them in client components - the bundler handles everything
 *
 * Example:
 * ```typescript
 * // actions.ts
 * "use server";
 *
 * export async function addComment(formData: FormData) {
 *   const comment = formData.get("comment");
 *   // ... save to database
 *   return { success: true };
 * }
 * ```
 *
 * ```tsx
 * // component.tsx
 * "use client";
 * import { useActionState } from "react";
 * import { addComment } from "./actions";
 *
 * function Comments() {
 *   const [state, formAction] = useActionState(addComment, null);
 *   return <form action={formAction}>...</form>;
 * }
 * ```
 */

import * as logging from "@eser/logging";

const actionLogger = logging.logger.getLogger([
  "laroux-server",
  "server-actions",
]);

/**
 * Server action function signature
 * Takes form data or arguments and returns a result
 */
export type ServerAction = (...args: unknown[]) => Promise<unknown>;

/**
 * Registry of server actions mapped by their unique IDs
 */
const actionRegistry = new Map<string, ServerAction>();

/**
 * Register a server action with a unique ID
 * @param id - Unique identifier for the action
 * @param fn - The server function to execute
 */
export function registerAction(id: string, fn: ServerAction): void {
  if (actionRegistry.has(id)) {
    actionLogger.warn(`Action ID "${id}" is already registered. Overwriting.`);
  }
  actionRegistry.set(id, fn);
  actionLogger.debug(`Registered action: ${id}`);
}

/**
 * Invoke a server action by its ID
 * @param id - The action ID to invoke
 * @param args - Arguments to pass to the action
 * @returns The result of the action execution
 */
export async function invokeAction(
  id: string,
  args: unknown[],
): Promise<unknown> {
  const action = actionRegistry.get(id);

  if (!action) {
    actionLogger.error(`Action not found: ${id}`);
    throw new Error(`Server action "${id}" not found`);
  }

  actionLogger.debug(`Invoking action: ${id}`, { args });

  try {
    const result = await action(...args);
    actionLogger.debug(`Action completed: ${id}`);
    return result;
  } catch (error) {
    actionLogger.error(`Action failed: ${id}`, { error });
    throw error;
  }
}

/**
 * Get all registered action IDs (for debugging)
 */
export function getRegisteredActions(): string[] {
  return Array.from(actionRegistry.keys());
}

/**
 * Clear all registered actions (for testing)
 */
export function clearActions(): void {
  actionRegistry.clear();
  actionLogger.debug("Cleared all registered actions");
}
