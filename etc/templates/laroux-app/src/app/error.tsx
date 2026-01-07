"use client";

export type ErrorPageProps = {
  error?: Error;
  reset?: () => void;
};

export function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-bold mb-4">Something went wrong</h1>
      <p className="text-neutral-600 mb-4">An unexpected error occurred.</p>
      {error?.message && (
        <p className="text-sm font-mono bg-neutral-100 p-3 rounded mb-6 max-w-md">
          {error.message}
        </p>
      )}
      <div className="flex gap-4">
        {reset && (
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            Try Again
          </button>
        )}
        <a
          href="/"
          className="px-4 py-2 bg-neutral-200 rounded hover:bg-neutral-300"
        >
          Go Home
        </a>
      </div>
    </main>
  );
}
