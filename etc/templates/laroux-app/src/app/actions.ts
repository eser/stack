/**
 * Server Actions
 * These functions run on the server and can be called from client components.
 *
 * The bundler automatically:
 * 1. Marks these functions with React's server reference symbols
 * 2. Generates client stubs that call the server via RSC protocol
 * 3. Action IDs are generated as: `path/to/file#exportName`
 *
 * Usage in client components:
 * ```tsx
 * import { addComment } from "./actions";
 * import { useActionState } from "react";
 *
 * function Comments() {
 *   const [state, formAction, isPending] = useActionState(addComment, null);
 *   return <form action={formAction}>...</form>;
 * }
 * ```
 */

"use server";

import * as logging from "@eser/logging";

const actionsLogger = logging.logger.getLogger(["app", "actions"]);

/**
 * Example server action: Add a comment
 * In a real app, this would save to a database
 */
export async function addComment(
  formData: Record<string, string>,
): Promise<{ success: boolean; comment?: string; error?: string }> {
  const comment = formData.comment;

  // Simulate async work
  await new Promise((resolve) => setTimeout(resolve, 500));

  if (!comment || comment.trim().length === 0) {
    return { success: false, error: "Comment cannot be empty" };
  }

  if (comment.length > 200) {
    return { success: false, error: "Comment too long (max 200 characters)" };
  }

  actionsLogger.info(`Comment added: ${comment}`);

  return {
    success: true,
    comment: comment.trim(),
  };
}

/**
 * Example server action: Increment counter
 */
export async function incrementCounter(amount: number = 1): Promise<number> {
  // Simulate database operation
  await new Promise((resolve) => setTimeout(resolve, 200));

  actionsLogger.info(`Counter incremented: ${amount}`);

  // In real app, this would read from/write to database
  return Date.now() + amount;
}
