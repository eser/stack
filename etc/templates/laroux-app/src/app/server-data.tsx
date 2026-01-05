/**
 * ServerData - Server Component Demo
 * This component runs on the server and demonstrates async data fetching
 * No "use client" directive - this is a pure server component
 */

type Quote = {
  quote: string;
  author: string;
  category: string;
};

/**
 * Fetch data from an API (simulated with delay)
 */
async function fetchServerData(): Promise<Quote> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  const quotes: Quote[] = [
    {
      quote:
        "React Server Components represent the future of React development.",
      author: "Dan Abramov",
      category: "React",
    },
    {
      quote:
        "Deno is secure by default and provides a modern runtime for JavaScript.",
      author: "Ryan Dahl",
      category: "Deno",
    },
    {
      quote: "The best code is no code at all.",
      author: "Jeff Atwood",
      category: "Programming",
    },
  ];

  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  return randomQuote;
}

/**
 * Server component that fetches and displays data
 */
export async function ServerData() {
  const data = await fetchServerData();
  const timestamp = new Date().toLocaleString();

  return (
    <div className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm">
      <h4 className="text-lg font-bold text-neutral-900 mb-1.5">
        Server Component Demo
      </h4>
      <p className="text-sm text-neutral-600 mb-4">
        Async data fetching on the server
      </p>

      <blockquote className="my-4 p-4 bg-primary-600 rounded-md text-white shadow-sm">
        <p className="text-sm italic leading-relaxed mb-2">
          "{data.quote}"
        </p>
        <footer className="text-right text-xs font-medium text-white/90">
          — {data.author}
        </footer>
      </blockquote>

      <div className="flex flex-wrap gap-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary-50 border border-primary-200 rounded text-xs">
          <span>📂</span>
          <span className="font-medium text-neutral-900">{data.category}</span>
        </div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 border border-neutral-200 rounded text-xs">
          <span>🕐</span>
          <span className="text-neutral-600">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}
