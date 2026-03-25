export function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">
        Welcome to laroux.js
      </h1>
      <p className="text-lg text-neutral-600">
        Edit{" "}
        <code className="bg-neutral-100 px-2 py-1 rounded font-mono text-sm">
          src/app/routes/home/page.tsx
        </code>{" "}
        to get started.
      </p>
    </main>
  );
}
