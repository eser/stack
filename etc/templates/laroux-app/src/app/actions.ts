/**
 * Server Actions
 * These functions run on the server and can be called from client components
 */

"use server";

import * as logging from "@eser/logging";
import { registerAction } from "@eser/laroux-server/action-registry";

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

// Register actions manually for now (until bundler transformation is complete)
// This will be automated by the bundler later
if (typeof Deno !== "undefined") {
  registerAction("addComment", addComment);
  registerAction("incrementCounter", incrementCounter);
}
