// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Example of multi-adapter module registration for Lime
 * This demonstrates how to register components for different view frameworks
 */

import { LimeRegistry } from "../registry.ts";

// React components (with hooks and Server Components)
const ReactUserProfile = async (props: { userId: string }) => {
  // This would be a React Server Component
  const user = await fetchUser(props.userId);
  return (
    <div className="user-profile">
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
};

const ReactInteractiveChart = (props: { data: number[] }) => {
  const [selectedPoint, setSelectedPoint] = useState(null);

  return (
    <div className="chart" onClick={handleClick}>
      {/* Interactive chart with React state */}
    </div>
  );
};

// Preact components (lightweight, with Signals)
const PreactCounter = (props: { initialValue: number }) => {
  const count = useSignal(props.initialValue);

  return (
    <div className="counter">
      <button onClick={() => count.value--}>-</button>
      <span>{count.value}</span>
      <button onClick={() => count.value++}>+</button>
    </div>
  );
};

// Static components (pure HTML)
const StaticFooter = (props: { year: number }) => {
  return (
    <footer className="footer">
      <p>&copy; {props.year} My Website. All rights reserved.</p>
    </footer>
  );
};

// Multi-adapter components (same interface, different implementations)
const MultiAdapterButton = {
  react: (props: { children: string; onClick?: () => void }) => (
    <button onClick={props.onClick}>{props.children}</button>
  ),
  preact: (props: { children: string; onClick?: () => void }) => (
    <button onClick={props.onClick}>{props.children}</button>
  ),
  static: (props: { children: string }) => (
    <button disabled>{props.children}</button>
  ),
};

// Route handlers
const dashboardHandler = (ctx) => {
  return (
    <div>
      <ReactUserProfile userId={ctx.params.userId} />
      <ReactInteractiveChart data={[1, 2, 3]} />
      <PreactCounter initialValue={0} />
    </div>
  );
};

const blogHandler = (ctx) => {
  // Lightweight blog page with Preact
  return (
    <article>
      <h1>Blog Post</h1>
      <p>Content goes here...</p>
      <PreactCounter initialValue={0} />
    </article>
  );
};

const aboutHandler = (ctx) => {
  // Static about page
  return (
    <main>
      <h1>About Us</h1>
      <p>We are a company...</p>
      <StaticFooter year={2024} />
    </main>
  );
};

// Server Actions (React 19)
const updateUserAction = async (formData: FormData) => {
  "use server";

  const name = formData.get("name");
  const email = formData.get("email");

  // Update user in database
  await updateUserInDB({ name, email });

  return { success: true };
};

// Layout components
const BaseLayout = (props: { children: any }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>My App</title>
      </head>
      <body>
        <header>
          <nav>Navigation</nav>
        </header>
        <main>{props.children}</main>
        <StaticFooter year={2024} />
      </body>
    </html>
  );
};

const AdminLayout = (props: { children: any }) => {
  return (
    <BaseLayout>
      <div className="admin-layout">
        <aside>Admin Sidebar</aside>
        <div className="admin-content">{props.children}</div>
      </div>
    </BaseLayout>
  );
};

/**
 * Lime module registration function
 * This is called by @eser/collector during build time
 */
export const limeModule = (registry: LimeRegistry) => {
  // Register routes with different adapters
  registry.addRoute("/", (ctx) => (
    <BaseLayout>
      <h1>Welcome</h1>
      <MultiAdapterButton adapter="static">Learn More</MultiAdapterButton>
    </BaseLayout>
  ), {
    adapter: "static", // Static homepage
    layout: "base",
  });

  registry.addRoute("/dashboard/:userId", dashboardHandler, {
    adapter: "react", // Complex dashboard needs React
    layout: "admin",
    methods: ["GET"],
  });

  registry.addRoute("/blog/:slug", blogHandler, {
    adapter: "preact", // Blog is lightweight, use Preact
    layout: "base",
    methods: ["GET"],
  });

  registry.addRoute("/about", aboutHandler, {
    adapter: "static", // About page is static
    layout: "base",
  });

  // Register layouts
  registry.addLayout("base", BaseLayout, {
    adapter: "static",
  });

  registry.addLayout("admin", AdminLayout, {
    parent: "base",
    adapter: "react", // Admin layout needs React features
  });

  // Register islands (client-side interactive components)
  registry.addIsland("Counter", PreactCounter, {
    adapter: "preact",
    props: ["initialValue"],
    hydration: "load",
  });

  registry.addIsland("InteractiveChart", ReactInteractiveChart, {
    adapter: "react",
    props: ["data"],
    hydration: "visible",
  });

  registry.addIsland("MultiButton", MultiAdapterButton, {
    adapter: "react", // Default to React, but has implementations for all
    props: ["children", "onClick"],
    hydration: "idle",
  });

  // Register Server Components (React 19)
  registry.addServerComponent("UserProfile", ReactUserProfile, {
    async: true,
    cache: {
      ttl: 300, // Cache for 5 minutes
      key: (ctx) => `user:${ctx.props.userId}`,
    },
  });

  // Register Server Actions (React 19)
  registry.addServerAction("updateUser", updateUserAction, {
    validation: "zod",
    rateLimit: {
      requests: 5,
      window: 60, // 5 requests per minute
    },
  });
};

// Helper functions (would be imported in real app)
async function fetchUser(userId: string) {
  // Simulate database fetch
  return {
    id: userId,
    name: "John Doe",
    email: "john@example.com",
  };
}

async function updateUserInDB(userData: { name: string; email: string }) {
  // Simulate database update
  console.log("Updating user:", userData);
}
