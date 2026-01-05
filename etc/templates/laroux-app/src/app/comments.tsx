"use client";

/**
 * Comments Component - Demonstrates Server Actions
 * Uses React 19's Server Actions with useOptimistic for instant feedback
 */

import { useActionState, useOptimistic } from "react";
import { Button } from "../components/button.tsx";
import { Badge } from "../components/badge.tsx";
import { Textarea } from "../components/textarea.tsx";
import { AlertCircle } from "lucide-react";

// Inline utility - extract error message from unknown error
function formatErrorAsString(err: unknown): string {
  return (err instanceof Error ? err.message : null) ?? "An error occurred";
}

/**
 * Client-side wrapper for server action
 * This will be generated automatically by the bundler in the future
 */
async function addCommentAction(formData: FormData) {
  // Convert FormData to plain object for JSON serialization
  const formDataObj: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    formDataObj[key] = value as string;
  }

  const response = await fetch("/action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      actionId: "addComment",
      args: [formDataObj],
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message ?? "Server action failed");
  }

  const { result } = await response.json();
  return result;
}

type Comment = [string, boolean]; // [text, isPending]

type CommentsState = {
  comments: Comment[];
  error: string | null;
};

export function Comments() {
  const [state, formAction, isPending] = useActionState(
    async (currentState: CommentsState, formData: FormData) => {
      const commentText = formData.get("comment") as string;

      // Optimistic update happens here (inside action context)
      addOptimisticComment(commentText);

      try {
        const result = await addCommentAction(formData);

        if (result.success) {
          return {
            comments: [
              ...currentState.comments,
              [result.comment, false] as Comment,
            ],
            error: null,
          };
        } else {
          return {
            comments: currentState.comments,
            error: result.error ?? "Failed to add comment",
          };
        }
      } catch (err) {
        return {
          comments: currentState.comments,
          error: formatErrorAsString(err),
        };
      }
    },
    { comments: [], error: null },
  );

  // Optimistic state shows pending comments immediately
  const [optimisticComments, addOptimisticComment] = useOptimistic<
    Comment[],
    string
  >(state.comments, (prevComments, newComment) => [
    ...prevComments,
    [newComment, true], // Mark as pending
  ]);

  return (
    <div className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm">
      <h4 className="text-lg font-bold text-neutral-900 mb-1.5">
        Server Actions Demo
      </h4>
      <p className="text-sm text-neutral-600 mb-4">
        Server-side form processing with React 19.x
      </p>

      <form action={formAction} className="space-y-3 mb-4">
        <div>
          <label
            htmlFor="comment"
            className="block text-xs font-medium text-neutral-700 mb-1.5"
          >
            Your Comment
          </label>
          <Textarea
            id="comment"
            name="comment"
            placeholder="Share your thoughts..."
            disabled={isPending}
            rows={3}
            state={state.error ? "error" : "default"}
          />
        </div>

        {state.error && (
          <div className="p-3 bg-danger-500 rounded-md flex items-center gap-2 text-white shadow-sm">
            <AlertCircle className="w-4 h-4 text-white" />
            <p className="text-sm flex-1">{state.error}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            type="submit"
            variant={isPending ? "secondary" : "primary"}
            disabled={isPending}
          >
            {isPending
              ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-neutral-500 border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </span>
              )
              : (
                "Add Comment"
              )}
          </Button>
        </div>
      </form>

      {optimisticComments.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h5 className="text-sm font-bold text-neutral-900">
              Comments
            </h5>
            <Badge variant="info" className="font-semibold">
              {optimisticComments.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {optimisticComments.map(([comment, isPending], index) => (
              <div
                key={index}
                className="p-3 bg-neutral-50 border border-neutral-200 rounded-md text-neutral-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs leading-relaxed flex-1">{comment}</p>
                  {isPending && (
                    <Badge variant="warning" className="shrink-0">
                      sending...
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
