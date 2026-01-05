"use client";

/**
 * Counter - Client Component Demo
 * This component runs in the browser and demonstrates client-side interactivity
 */

import { useState } from "react";
import { Button } from "../components/button.tsx";
import { Badge } from "../components/badge.tsx";

export function Counter() {
  const [count, setCount] = useState(0);
  const [clicks, setClicks] = useState(0);

  const increment = () => {
    setCount(count + 1);
    setClicks(clicks + 1);
  };

  const decrement = () => {
    setCount(count - 1);
    setClicks(clicks + 1);
  };

  const reset = () => {
    setCount(0);
    setClicks(clicks + 1);
  };

  return (
    <div className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm">
      <h4 className="text-lg font-bold text-neutral-900 mb-1.5">
        Client Component Demo
      </h4>
      <p className="text-sm text-neutral-600 mb-4">
        Interactive counter powered by React hooks
      </p>

      <div className="bg-primary-50 border border-primary-200 rounded-md p-6 mb-4 text-center shadow-sm">
        <div
          className={`text-5xl font-bold transition-colors ${
            count > 0
              ? "text-success-500"
              : count < 0
              ? "text-danger-500"
              : "text-primary-600"
          }`}
        >
          {count}
        </div>
      </div>

      <div className="flex gap-2 justify-center mb-4">
        <Button
          key="decrement"
          type="button"
          onClick={decrement}
          variant="primary"
          className="w-12 h-12 text-xl"
          aria-label="Decrement"
        >
          −
        </Button>

        <Button
          key="reset"
          type="button"
          onClick={reset}
          variant="secondary"
          className="px-5"
        >
          Reset
        </Button>

        <Button
          key="increment"
          type="button"
          onClick={increment}
          variant="primary"
          className="w-12 h-12 text-xl"
          aria-label="Increment"
        >
          +
        </Button>
      </div>

      <div className="text-center">
        <Badge variant="default">
          Total interactions: <strong>{clicks}</strong>
        </Badge>
      </div>
    </div>
  );
}
