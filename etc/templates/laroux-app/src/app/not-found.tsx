// 404 Not Found Page

/**
 * NotFound Page - Shown when a route is not matched
 * Server Component
 */
export function NotFound() {
  return (
    <section className="container items-center px-4 mx-auto grid min-h-[60vh]">
      <div className="flex max-w-[600px] flex-col items-center text-center mx-auto">
        <div className="mb-8">
          <span className="text-8xl font-bold text-neutral-200">404</span>
        </div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-4">
          Page Not Found
        </h1>
        <p className="text-neutral-600 mb-8 text-lg">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4">
          <a href="/" className="btn">
            Go Home
          </a>
        </div>
      </div>
    </section>
  );
}
