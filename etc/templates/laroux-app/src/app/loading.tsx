/**
 * Loading - Fallback component for Suspense boundaries
 * This is a SERVER component that gets inlined in Suspense fallbacks
 */

import { Hourglass } from "lucide-react";

export function Loading(
  { message = "Loading..." }: { message?: string },
) {
  return (
    <div className="bg-warning-50 rounded-lg p-4 text-center min-h-[12rem] flex flex-col items-center justify-center">
      <div className="inline-flex items-center justify-center bg-warning-500 rounded-full mb-2 p-2">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
      <p className="text-neutral-900 font-semibold text-sm mb-1">
        {message}
      </p>
      <p className="text-warning-700 text-xs font-medium animate-pulse flex items-center justify-center gap-1">
        <Hourglass className="w-3 h-3" />
        Streaming from server...
      </p>
    </div>
  );
}
