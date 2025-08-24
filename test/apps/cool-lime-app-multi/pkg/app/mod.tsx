// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Multi-adapter Lime application module
 * Demonstrates React, Preact, and Static components working together
 */

import { useState } from "npm:react";
import { useSignal } from "npm:@preact/signals";
import { LimeRegistry } from "@cool/lime";

// React components (with hooks and Server Components)
const ReactUserProfile = async (props: { userId: string }) => {
  "use server";

  // Simulate async data fetching
  const user = await fetchUser(props.userId);
  return (
    <div
      className="user-profile"
      style="border: 2px solid #61dafb; padding: 1rem; margin: 1rem 0;"
    >
      <h2 style="color: #61dafb;">👤 React Server Component</h2>
      <h3>{user.name}</h3>
      <p>Email: {user.email}</p>
      <p>Role: {user.role}</p>
    </div>
  );
};

const ReactInteractiveChart = (props: { data: number[] }) => {
  "use client";

  const [selectedPoint, setSelectedPoint] = useState(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);

  const handleClick = (index: number, value: number) => {
    setSelectedPoint({ index, value });
  };

  return (
    <div
      className="chart"
      style="border: 2px solid #61dafb; padding: 1rem; margin: 1rem 0;"
    >
      <h3 style="color: #61dafb;">📊 React Interactive Chart</h3>
      <div style="display: flex; align-items: end; gap: 4px; height: 100px;">
        {props.data.map((value, index) => (
          <div
            key={index}
            onClick={() => handleClick(index, value)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(-1)}
            style={{
              width: "30px",
              height: `${value * 10}px`,
              backgroundColor: selectedPoint?.index === index
                ? "#ff6b6b"
                : hoveredIndex === index
                ? "#4ecdc4"
                : "#61dafb",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            title={`Value: ${value}`}
          />
        ))}
      </div>
      {selectedPoint && (
        <p>
          Selected: Point {selectedPoint.index + 1} with value{" "}
          {selectedPoint.value}
        </p>
      )}
    </div>
  );
};

// Preact components (lightweight, with Signals)
const PreactCounter = (props: { initialValue: number; label?: string }) => {
  const count = useSignal(props.initialValue);

  return (
    <div
      className="counter"
      style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0;"
    >
      <h3 style="color: #673ab8;">
        🔢 Preact Counter {props.label ? `(${props.label})` : ""}
      </h3>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <button
          onClick={() => count.value--}
          style="padding: 0.5rem 1rem; font-size: 1.2rem; background: #673ab8; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          -
        </button>
        <span style="font-size: 1.5rem; font-weight: bold; min-width: 3rem; text-align: center;">
          {count.value}
        </span>
        <button
          onClick={() => count.value++}
          style="padding: 0.5rem 1rem; font-size: 1.2rem; background: #673ab8; color: white; border: none; border-radius: 4px; cursor: pointer;"
        >
          +
        </button>
      </div>
      <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
        Uses Preact Signals for reactive state
      </p>
    </div>
  );
};

const PreactToggle = (props: { label: string }) => {
  const isOn = useSignal(false);

  return (
    <div style="border: 2px solid #673ab8; padding: 1rem; margin: 1rem 0;">
      <h4 style="color: #673ab8;">🔘 {props.label}</h4>
      <button
        onClick={() => isOn.value = !isOn.value}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: isOn.value ? "#4caf50" : "#f44336",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
        }}
      >
        {isOn.value ? "ON" : "OFF"}
      </button>
    </div>
  );
};

// Static components (pure HTML)
const StaticFooter = (props: { year: number; company?: string }) => {
  return (
    <footer
      className="footer"
      style="border-top: 2px solid #666; padding: 1rem; margin-top: 2rem; text-align: center; background: #f5f5f5;"
    >
      <p style="margin: 0; color: #666;">
        &copy; {props.year}{" "}
        {props.company || "Multi-Adapter Lime App"}. All rights reserved.
      </p>
      <p style="margin: 0.5rem 0 0 0; font-size: 0.8rem; color: #999;">
        Generated as static HTML - no JavaScript needed
      </p>
    </footer>
  );
};

const StaticNavigation = () => {
  return (
    <nav style="background: #333; padding: 1rem;">
      <ul style="list-style: none; margin: 0; padding: 0; display: flex; gap: 2rem;">
        <li>
          <a href="/" style="color: white; text-decoration: none;">🏠 Home</a>
        </li>
        <li>
          <a href="/dashboard/123" style="color: white; text-decoration: none;">
            📊 Dashboard
          </a>
        </li>
        <li>
          <a
            href="/blog/example-post"
            style="color: white; text-decoration: none;"
          >
            📝 Blog
          </a>
        </li>
        <li>
          <a href="/about" style="color: white; text-decoration: none;">
            ℹ️ About
          </a>
        </li>
      </ul>
    </nav>
  );
};

// Multi-adapter components (same interface, different implementations)
const MultiAdapterButton = {
  react: (
    props: { children: string; onClick?: () => void; variant?: string },
  ) => (
    <button
      onClick={props.onClick}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: props.variant === "primary" ? "#007bff" : "#6c757d",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
      }}
    >
      {props.children} (React)
    </button>
  ),
  preact: (
    props: { children: string; onClick?: () => void; variant?: string },
  ) => (
    <button
      onClick={props.onClick}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: props.variant === "primary" ? "#673ab8" : "#6c757d",
        color: "white",
        border: "none",
        borderRadius: "4px",
        cursor: "pointer",
      }}
    >
      {props.children} (Preact)
    </button>
  ),
  static: (props: { children: string; variant?: string }) => (
    <button
      disabled
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: "#6c757d",
        color: "white",
        border: "none",
        borderRadius: "4px",
        opacity: "0.6",
      }}
    >
      {props.children} (Static)
    </button>
  ),
};

// Route handlers
const homeHandler = (ctx) => {
  return (
    <div>
      <h1>🍋 Welcome to Multi-Adapter Lime!</h1>
      <p>
        This homepage is rendered as <strong>static HTML</strong>{" "}
        for maximum performance.
      </p>

      <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        <h3>🚀 What's This App About?</h3>
        <p>
          This application demonstrates Lime's unique multi-adapter
          architecture:
        </p>
        <ul>
          <li>
            <strong>React</strong>{" "}
            - For complex interactions and Server Components
          </li>
          <li>
            <strong>Preact</strong>{" "}
            - For lightweight, performance-critical components
          </li>
          <li>
            <strong>Static</strong> - For pure HTML with zero JavaScript
          </li>
        </ul>
      </div>

      <div style="display: flex; gap: 1rem; margin: 1rem 0;">
        <MultiAdapterButton variant="primary">Learn More</MultiAdapterButton>
        <MultiAdapterButton>Get Started</MultiAdapterButton>
      </div>
    </div>
  );
};

const dashboardHandler = (ctx) => {
  return (
    <div>
      <h1>📊 Dashboard (React-Powered)</h1>
      <p>
        This dashboard uses <strong>React</strong>{" "}
        for complex state management and Server Components.
      </p>
      <p>
        User ID: <code>{ctx.params.userId}</code>
      </p>

      <ReactUserProfile userId={ctx.params.userId} />
      <ReactInteractiveChart data={[8, 12, 6, 9, 15, 11, 7, 13]} />

      <h3>Mixed Components Demo:</h3>
      <PreactCounter initialValue={5} label="Page Views" />
      <PreactToggle label="Dark Mode" />
    </div>
  );
};

const blogHandler = (ctx) => {
  return (
    <article>
      <h1>📝 Blog Post: {ctx.params.slug}</h1>
      <p>
        This blog is powered by <strong>Preact</strong>{" "}
        for optimal bundle size and performance.
      </p>

      <div style="background: #e8f5e8; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        <h3>Why Preact for Blogs?</h3>
        <ul>
          <li>Smaller bundle size (3KB vs 45KB for React)</li>
          <li>Faster initial load times</li>
          <li>Perfect for content-heavy sites</li>
          <li>Compatible with React ecosystem</li>
        </ul>
      </div>

      <h3>Interactive Elements:</h3>
      <PreactCounter initialValue={0} label="Likes" />
      <PreactToggle label="Subscribe to Newsletter" />
    </article>
  );
};

const aboutHandler = (ctx) => {
  return (
    <main>
      <h1>ℹ️ About This App</h1>
      <p>
        This page is <strong>completely static</strong>{" "}
        - no JavaScript bundle needed!
      </p>

      <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        <h3>🎯 Architecture Highlights</h3>
        <ul>
          <li>
            <strong>Manifest-Driven Routing</strong>{" "}
            - Routes defined in modules, not file structure
          </li>
          <li>
            <strong>Multi-Adapter Support</strong>{" "}
            - Mix React, Preact, and static components
          </li>
          <li>
            <strong>Server Components</strong>{" "}
            - React 19 RSC support for data fetching
          </li>
          <li>
            <strong>Islands Architecture</strong>{" "}
            - Selective hydration for performance
          </li>
          <li>
            <strong>Enterprise Ready</strong>{" "}
            - Built on Lime's DI and module system
          </li>
        </ul>
      </div>

      <h3>🔧 Technology Stack</h3>
      <ul>
        <li>
          <strong>Lime Framework</strong> - View-agnostic web framework
        </li>
        <li>
          <strong>React 19</strong> - Server Components and Server Actions
        </li>
        <li>
          <strong>Preact</strong> - Lightweight alternative with Signals
        </li>
        <li>
          <strong>Static HTML</strong> - Zero-JS pages for maximum speed
        </li>
        <li>
          <strong>TypeScript</strong> - End-to-end type safety
        </li>
      </ul>
    </main>
  );
};

// Server Actions (React 19)
const updateUserAction = async (formData: FormData) => {
  "use server";

  const name = formData.get("name") as string;
  const email = formData.get("email") as string;

  // Simulate database update
  await updateUserInDB({ name, email });

  return { success: true, message: `Updated user: ${name}` };
};

const subscribeAction = async (formData: FormData) => {
  "use server";

  const email = formData.get("email") as string;

  // Simulate newsletter subscription
  console.log(`New subscription: ${email}`);

  return { success: true, message: "Successfully subscribed!" };
};

// Layout components
const BaseLayout = (props: { children: any; title?: string }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title || "Multi-Adapter Lime App"}</title>
        <style>
          {`
          body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6; }
          .container { max-width: 1200px; margin: 0 auto; padding: 1rem; }
          h1 { color: #2c3e50; }
          code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; }
        `}
        </style>
      </head>
      <body>
        <StaticNavigation />
        <div className="container">
          {props.children}
        </div>
        <StaticFooter year={2024} company="Lime Framework" />
      </body>
    </html>
  );
};

const AdminLayout = (props: { children: any }) => {
  return (
    <BaseLayout title="Admin Dashboard - Multi-Adapter Lime">
      <div style="display: grid; grid-template-columns: 250px 1fr; gap: 2rem; margin-top: 1rem;">
        <aside style="background: #f8f9fa; padding: 1rem; border-radius: 4px; height: fit-content;">
          <h3>🔧 Admin Panel</h3>
          <ul style="list-style: none; padding: 0;">
            <li style="margin: 0.5rem 0;">
              <a href="/dashboard/123" style="text-decoration: none;">
                📊 Dashboard
              </a>
            </li>
            <li style="margin: 0.5rem 0;">
              <a href="/admin/users" style="text-decoration: none;">👥 Users</a>
            </li>
            <li style="margin: 0.5rem 0;">
              <a href="/admin/settings" style="text-decoration: none;">
                ⚙️ Settings
              </a>
            </li>
          </ul>
        </aside>
        <div className="admin-content">
          {props.children}
        </div>
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
  registry.addRoute("/", homeHandler, {
    adapter: "static", // Static homepage for performance
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
    props: ["initialValue", "label"],
    hydration: "load",
  });

  registry.addIsland("Toggle", PreactToggle, {
    adapter: "preact",
    props: ["label"],
    hydration: "visible",
  });

  registry.addIsland("InteractiveChart", ReactInteractiveChart, {
    adapter: "react",
    props: ["data"],
    hydration: "visible",
  });

  registry.addIsland("MultiButton", MultiAdapterButton, {
    adapter: "react", // Default to React, but has implementations for all
    props: ["children", "onClick", "variant"],
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

  registry.addServerAction("subscribe", subscribeAction, {
    validation: "zod",
    rateLimit: {
      requests: 3,
      window: 300, // 3 requests per 5 minutes
    },
  });
};

// Helper functions
async function fetchUser(userId: string) {
  // Simulate database fetch with delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  const users = {
    "123": {
      id: "123",
      name: "John Doe",
      email: "john@example.com",
      role: "Admin",
    },
    "456": {
      id: "456",
      name: "Jane Smith",
      email: "jane@example.com",
      role: "User",
    },
    "789": {
      id: "789",
      name: "Bob Johnson",
      email: "bob@example.com",
      role: "Editor",
    },
  };

  return users[userId] || {
    id: userId,
    name: "Unknown User",
    email: "unknown@example.com",
    role: "Guest",
  };
}

async function updateUserInDB(userData: { name: string; email: string }) {
  // Simulate database update
  console.log("📝 Updating user in database:", userData);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { success: true };
}
