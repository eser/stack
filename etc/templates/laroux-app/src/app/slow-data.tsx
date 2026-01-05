/**
 * SlowData - Server Component that simulates slow async data fetching
 * Demonstrates streaming with Suspense boundaries
 */

import * as logging from "@eser/logging";

import { Clock } from "lucide-react";

const slowDataLogger = logging.logger.getLogger(["app", "slow-data"]);

// Simulate slow API call
async function fetchSlowData(delay: number = 2000): Promise<string> {
  await new Promise((resolve) => setTimeout(resolve, delay));
  const timestamp = new Date().toISOString();

  slowDataLogger.debug(
    `🎨 Server-side data fetched at ${timestamp}`,
  );

  return `Data loaded after ${delay}ms`;
}

export async function SlowData({ delay = 2000 }: { delay?: number }) {
  const data = await fetchSlowData(delay);

  return (
    <div className="bg-surface rounded-md border border-neutral-200 p-4 shadow-sm">
      <div className="flex items-center gap-2.5 mb-3">
        <Clock className="w-8 h-8 text-neutral-600" strokeWidth={1} />
        <div>
          <h3 className="text-sm font-bold text-neutral-900">
            Slow Async Component
          </h3>
          <p className="text-xs text-neutral-600">
            {delay}ms server delay
          </p>
        </div>
      </div>

      <p className="text-neutral-800 text-xs py-2 px-3 bg-success-50 border border-success-200 rounded font-medium">
        {data}
      </p>
    </div>
  );
}
