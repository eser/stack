// Error Page - Shown when an error occurs
"use client";

export type ErrorPageProps = {
  error?: Error;
  reset?: () => void;
};

/**
 * ErrorPage - Shown when a runtime error occurs
 * Client Component for interactivity (reset button)
 */
export function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <section className="container items-center px-4 mx-auto grid min-h-[60vh]">
      <div className="flex max-w-[600px] flex-col items-center text-center mx-auto">
        <div className="mb-6">
          <span className="text-6xl">!</span>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">
          Something went wrong
        </h1>
        <p className="text-neutral-600 mb-4 text-lg">
          An unexpected error occurred. Please try again.
        </p>
        {error?.message && (
          <p className="text-neutral-500 mb-6 text-sm font-mono bg-neutral-100 p-3 rounded-lg max-w-full overflow-auto">
            {error.message}
          </p>
        )}
        <div className="flex gap-4">
          {reset && (
            <button
              type="button"
              onClick={reset}
              className="btn"
            >
              Try Again
            </button>
          )}
          <a href="/" className="btn">
            Go Home
          </a>
        </div>
      </div>
    </section>
  );
}
