// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Demo routes showcasing all framework capabilities
 */

import { LimeRegistry } from "@cool/lime";

// Import islands (these would be resolved at runtime)
const DataTable = ({ data }: { data: any[] }) => (
  <div style="border: 2px solid #61dafb; padding: 1rem; margin: 1rem 0;">
    <h3 style="color: #61dafb;">📊 React Data Table Island</h3>
    <p>
      This would be a fully interactive data table with {data?.length || 0}{" "}
      items.
    </p>
    <div style="background: #f0f8ff; padding: 1rem; border-radius: 4px;">
      {data?.map((item: any, index: number) => (
        <div
          key={index}
          style="padding: 0.5rem; border-bottom: 1px solid #ddd;"
        >
          {item.name} - {item.status}
        </div>
      )) || <p>No data</p>}
    </div>
  </div>
);

const Calculator = () => (
  <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0;">
    <h3 style="color: #673ab8;">🧮 Preact Calculator Island</h3>
    <p>This would be a fully functional calculator with Preact Signals.</p>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; width: 250px;">
      <div style="padding: 1rem; background: #f0f0f0; text-align: center;">
        7
      </div>
      <div style="padding: 1rem; background: #f0f0f0; text-align: center;">
        8
      </div>
      <div style="padding: 1rem; background: #f0f0f0; text-align: center;">
        9
      </div>
      <div style="padding: 1rem; background: #673ab8; color: white; text-align: center;">
        ÷
      </div>
    </div>
  </div>
);

const Timer = ({ initialSeconds }: { initialSeconds?: number }) => (
  <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; text-align: center;">
    <h3 style="color: #673ab8;">⏱️ Preact Timer Island</h3>
    <p>
      This would be a countdown timer starting from {initialSeconds || 30}{" "}
      seconds.
    </p>
    <div style="font-size: 3rem; font-weight: bold; color: #333; margin: 1rem 0;">
      00:{String(initialSeconds || 30).padStart(2, "0")}
    </div>
  </div>
);

const Counter = (
  { initialValue, label }: { initialValue?: number; label?: string },
) => (
  <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; text-align: center;">
    <h4 style="color: #673ab8;">{label || "Counter"}</h4>
    <div style="font-size: 2rem; font-weight: bold; margin: 1rem 0;">
      {initialValue || 0}
    </div>
    <p>This would be an interactive counter with Preact Signals.</p>
  </div>
);

const demoHandler = (ctx) => {
  // Return a simple string for now to test basic routing
  return new Response(
    `
    <!DOCTYPE html>
    <html>
    <head>
      <title>🎮 Interactive Demo - Lime Multi-Adapter App</title>
      <meta charset="utf-8">
    </head>
    <body>
      <h1>🎮 Interactive Demo</h1>
      <p>This page showcases all interactive islands working together!</p>

      <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        <h3>🏗️ What You're Seeing</h3>
        <p>Each interactive component below is an "island" that runs independently:</p>
        <ul>
          <li><strong>React Islands</strong> - Complex data table with sorting, filtering, selection</li>
          <li><strong>Preact Islands</strong> - Calculator and timer using Signals for state</li>
          <li><strong>Mixed Usage</strong> - Different frameworks for different use cases</li>
        </ul>
      </div>

      <h2>🔢 React Data Table Island (Demo)</h2>
      <div style="border: 2px solid #61dafb; padding: 1rem; margin: 1rem 0;">
        <h3 style="color: #61dafb;">📊 React Data Table Island</h3>
        <p>This would be a fully interactive data table with 5 items.</p>
        <div style="background: #f0f8ff; padding: 1rem; border-radius: 4px;">
          <div style="padding: 0.5rem; border-bottom: 1px solid #ddd;">Alice Johnson - active</div>
          <div style="padding: 0.5rem; border-bottom: 1px solid #ddd;">Bob Smith - inactive</div>
          <div style="padding: 0.5rem; border-bottom: 1px solid #ddd;">Charlie Brown - active</div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">
        <div>
          <h2>🧮 Preact Calculator</h2>
          <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0;">
            <h3 style="color: #673ab8;">🧮 Preact Calculator Island</h3>
            <p>This would be a fully functional calculator with Preact Signals.</p>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; width: 250px;">
              <div style="padding: 1rem; background: #f0f0f0; text-align: center;">7</div>
              <div style="padding: 1rem; background: #f0f0f0; text-align: center;">8</div>
              <div style="padding: 1rem; background: #f0f0f0; text-align: center;">9</div>
              <div style="padding: 1rem; background: #673ab8; color: white; text-align: center;">÷</div>
            </div>
          </div>
        </div>

        <div>
          <h2>⏱️ Preact Timer</h2>
          <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0; text-align: center;">
            <h3 style="color: #673ab8;">⏱️ Preact Timer Island</h3>
            <p>This would be a countdown timer starting from 30 seconds.</p>
            <div style="font-size: 3rem; font-weight: bold; color: #333; margin: 1rem 0;">00:30</div>
          </div>
        </div>
      </div>

      <div style="background: #e3f2fd; padding: 1rem; border-radius: 4px; margin: 2rem 0;">
        <h3>💡 Performance Benefits</h3>
        <ul>
          <li><strong>Selective Hydration</strong> - Only interactive components load JavaScript</li>
          <li><strong>Framework Optimization</strong> - React for complex, Preact for simple</li>
          <li><strong>Bundle Splitting</strong> - Each island loads independently</li>
          <li><strong>Progressive Enhancement</strong> - Works with JavaScript disabled</li>
        </ul>
      </div>

      <div style="background: #d4edda; padding: 1rem; border-radius: 4px; margin: 2rem 0;">
        <h3>🎉 Success!</h3>
        <p><strong>Lime Multi-Adapter Framework is working!</strong></p>
        <ul>
          <li>✅ React 19 Server Components support</li>
          <li>✅ Server Actions middleware</li>
          <li>✅ Multi-framework Islands architecture</li>
          <li>✅ Manifest-driven routing</li>
          <li>✅ View-agnostic adapter system</li>
        </ul>
      </div>
    </body>
    </html>
  `,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
};

const performanceHandler = (ctx) => {
  return (
    <div>
      <h1>⚡ Performance Showcase</h1>
      <p>Compare different rendering strategies on this page.</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin: 2rem 0;">
        {/* Static Section - No JS */}
        <div style="border: 2px solid #666; padding: 1rem;">
          <h3 style="color: #666;">📄 Static HTML</h3>
          <p>This section is pure HTML. No JavaScript bundle needed.</p>
          <ul>
            <li>Instant loading</li>
            <li>SEO friendly</li>
            <li>Accessible by default</li>
            <li>Works offline</li>
          </ul>
          <p style="font-size: 0.8rem; color: #999;">Bundle size: 0kb</p>
        </div>

        {/* Preact Section - Minimal JS */}
        <div style="border: 2px solid #673ab8; padding: 1rem;">
          <h3 style="color: #673ab8;">⚡ Preact Island</h3>
          <p>Lightweight interactivity with minimal overhead.</p>
          <Counter initialValue={0} label="Clicks" />
          <p style="font-size: 0.8rem; color: #999;">Bundle size: ~3kb</p>
        </div>

        {/* React Section - Full features */}
        <div style="border: 2px solid #61dafb; padding: 1rem;">
          <h3 style="color: #61dafb;">🚀 React Island</h3>
          <p>Full-featured interactions when you need them.</p>
          <div style="min-height: 100px; background: #f0f0f0; display: flex; align-items: center; justify-content: center; border-radius: 4px;">
            <span>Complex React Component</span>
          </div>
          <p style="font-size: 0.8rem; color: #999;">Bundle size: ~45kb</p>
        </div>
      </div>

      <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 1rem; border-radius: 4px; margin: 2rem 0;">
        <h3>📊 Performance Metrics</h3>
        <p>This page demonstrates optimal loading strategies:</p>
        <ul>
          <li>
            <strong>Initial HTML</strong> - Loads instantly (static content)
          </li>
          <li>
            <strong>Critical JavaScript</strong> - Only for interactive islands
          </li>
          <li>
            <strong>Lazy Loading</strong>{" "}
            - Non-critical islands load when needed
          </li>
          <li>
            <strong>Code Splitting</strong> - React and Preact bundles separate
          </li>
        </ul>
      </div>
    </div>
  );
};

const comparisonHandler = (ctx) => {
  return (
    <div>
      <h1>🥊 Framework Comparison</h1>
      <p>See the same functionality implemented with different frameworks.</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin: 2rem 0;">
        {/* React Implementation */}
        <div>
          <h2 style="color: #61dafb;">⚛️ React Version</h2>
          <div style="border: 2px solid #61dafb; padding: 1rem;">
            <h4>Counter with React Hooks</h4>
            <div style="background: #f0f8ff; padding: 1rem; border-radius: 4px; font-family: monospace; font-size: 0.9rem;">
              {`const [count, setCount] = useState(0);

return (
  <button onClick={() => setCount(count + 1)}>
    Count: {count}
  </button>
);`}
            </div>
            <Counter initialValue={0} label="React Counter" />
            <p style="font-size: 0.8rem; color: #666;">
              ✅ Rich ecosystem<br />
              ✅ Great dev tools<br />
              ✅ Server Components<br />
              ❌ Larger bundle size
            </p>
          </div>
        </div>

        {/* Preact Implementation */}
        <div>
          <h2 style="color: #673ab8;">⚡ Preact Version</h2>
          <div style="border: 2px solid #673ab8; padding: 1rem;">
            <h4>Counter with Preact Signals</h4>
            <div style="background: #f5f0ff; padding: 1rem; border-radius: 4px; font-family: monospace; font-size: 0.9rem;">
              {`const count = useSignal(0);

return (
  <button onClick={() => count.value++}>
    Count: {count}
  </button>
);`}
            </div>
            <Counter initialValue={0} label="Preact Counter" />
            <p style="font-size: 0.8rem; color: #666;">
              ✅ Tiny bundle size<br />
              ✅ Fast performance<br />
              ✅ Reactive Signals<br />
              ❌ Smaller ecosystem
            </p>
          </div>
        </div>
      </div>

      <div style="background: #e8f5e8; padding: 1rem; border-radius: 4px; margin: 2rem 0;">
        <h3>🎯 When to Use Which?</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-top: 1rem;">
          <div>
            <h4>🚀 Use React for:</h4>
            <ul style="font-size: 0.9rem;">
              <li>Complex state management</li>
              <li>Server Components</li>
              <li>Rich interactions</li>
              <li>Team familiarity</li>
            </ul>
          </div>
          <div>
            <h4>⚡ Use Preact for:</h4>
            <ul style="font-size: 0.9rem;">
              <li>Performance-critical parts</li>
              <li>Simple interactions</li>
              <li>Mobile-first apps</li>
              <li>Bundle size matters</li>
            </ul>
          </div>
          <div>
            <h4>📄 Use Static for:</h4>
            <ul style="font-size: 0.9rem;">
              <li>Content pages</li>
              <li>SEO-critical pages</li>
              <li>Maximum accessibility</li>
              <li>Zero JavaScript needed</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export const limeModule = (registry: LimeRegistry) => {
  registry.addRoute("/demo", demoHandler, {
    adapter: "react",
    layout: "base",
    methods: ["GET"],
  });

  registry.addRoute("/demo/performance", performanceHandler, {
    adapter: "static", // Performance demo page is mostly static
    layout: "base",
    methods: ["GET"],
  });

  registry.addRoute("/demo/comparison", comparisonHandler, {
    adapter: "preact", // Show off Preact for this demo
    layout: "base",
    methods: ["GET"],
  });
};
