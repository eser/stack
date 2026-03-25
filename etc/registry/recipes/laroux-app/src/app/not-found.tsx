export function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <span className="text-8xl font-bold text-neutral-200 mb-4">404</span>
      <h1 className="text-3xl font-bold mb-4">Page Not Found</h1>
      <p className="text-neutral-600 mb-8">
        The page you're looking for doesn't exist.
      </p>
      <a
        href="/"
        className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
      >
        Go Home
      </a>
    </main>
  );
}
