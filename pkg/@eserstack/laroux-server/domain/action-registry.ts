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
 * // comments.tsx
 * "use client";
 * import * as React from "react";
 * import * as actions from "./actions.ts";
 *
 * export function Comments() {
 *   const [state, formAction] = React.useActionState(actions.addComment, null);
 *   return <form action={formAction}>...</form>;
 * }
 * ```
 */

import * as logging from "@eserstack/logging";

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
 * Error thrown by {@link invokeAction}. `actionId` names the action; when the
 * action itself threw, `cause` holds that original error.
 */
export class ServerActionError extends Error {
  /** Id of the action that was invoked */
  readonly actionId: string;

  /**
   * Create the error for one action.
   *
   * @param actionId - Id of the action that was invoked
   * @param message - What failed, naming the action
   * @param options - `cause` carries the action's own error
   */
  constructor(actionId: string, message: string, options?: ErrorOptions) {
    // Explicit assignment, not parameter properties: Node's erase-only type
    // stripping cannot emit the assignments they imply.
    super(message, options);
    this.name = "ServerActionError";
    this.actionId = actionId;
  }
}

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
 *
 * Errors are returned to the caller, not logged here: the caller that handles
 * the failure logs it once.
 *
 * @param id - The action ID to invoke
 * @param args - Arguments to pass to the action
 * @returns The result of the action execution
 * @throws {ServerActionError} When no action is registered under `id`, or when
 *   the action throws; the action's own error is the `cause`
 */
export async function invokeAction(
  id: string,
  args: unknown[],
): Promise<unknown> {
  const action = actionRegistry.get(id);

  if (action === undefined) {
    throw new ServerActionError(
      id,
      `invoke server action "${id}": no action is registered under this id; register it with registerAction() first`,
    );
  }

  // Arguments are user input and may hold personal data, so only their count
  // is logged.
  const log = actionLogger.with({ actionId: id, argCount: args.length });
  log.debug("invoking action");

  try {
    const result = await action(...args);
    log.debug("action completed");
    return result;
  } catch (error) {
    throw new ServerActionError(id, `invoke server action "${id}"`, {
      cause: error,
    });
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
