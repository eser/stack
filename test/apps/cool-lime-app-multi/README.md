# 🍋 Multi-Adapter Lime App

A comprehensive example demonstrating Lime's unique **view-agnostic
architecture** where React, Preact, and static HTML coexist in a single
application.

## 🎯 What This Demonstrates

This application showcases Lime's revolutionary approach to web frameworks:

- **🏗️ View-Agnostic Architecture** - Like Astro, but for any JSX framework
- **⚛️ React 19 Support** - Server Components, Server Actions, Streaming SSR
- **⚡ Preact Islands** - Lightweight interactions with Signals
- **📄 Static HTML** - Zero-JavaScript pages for maximum performance
- **🎮 Islands Architecture** - Selective hydration per component
- **📋 Manifest-Driven** - Explicit routing and component registration

## 🚀 Quick Start

```bash
# Build the application manifests
deno run build.ts

# Start the development server
deno run --allow-all main.ts

# Visit http://localhost:8000
```

## 🏗️ Architecture Overview

### Multi-Adapter Routing

```typescript
// Different routes use different frameworks based on needs
registry.addRoute("/", homeHandler, { adapter: "static" }); // Fast loading
registry.addRoute("/dashboard/:id", dashHandler, { adapter: "react" }); // Complex UI
registry.addRoute("/blog/:slug", blogHandler, { adapter: "preact" }); // Lightweight
```

### Mixed Islands

```typescript
// Same page can mix different frameworks
<ReactInteractiveChart data={chartData} />     // Complex data visualization
<PreactCounter initialValue={0} />             // Simple state management
<StaticFooter year={2024} />                   // No JavaScript needed
```

### Server Components (React 19)

```typescript
const UserProfile = async ({ userId }) => {
  "use server";
  const user = await fetchUser(userId); // Server-side data fetching
  return <div>{user.name}</div>;
};
```

## 📁 Project Structure

```
test/apps/cool-lime-app-multi/
├── build.ts                    # Manifest generation
├── main.ts                     # Application entry point
├── manifest.jsonc              # App configuration
├── manifest.yaml               # Alternative config format
└── pkg/
    ├── app/
    │   └── mod.tsx             # Main routes and layouts
    ├── components/
    │   └── islands.tsx         # Interactive island components
    └── routes/
        └── demo.tsx            # Demo pages
```

## 🎮 Pages & Features

### 🏠 Home Page (`/`) - Static

- **Adapter**: Static HTML
- **Bundle Size**: 0kb JavaScript
- **Features**: Instant loading, SEO optimized

### 📊 Dashboard (`/dashboard/123`) - React

- **Adapter**: React with Server Components
- **Features**:
  - Server-side user data fetching
  - Interactive charts with complex state
  - Real-time data updates
  - Admin layout with sidebar

### 📝 Blog (`/blog/example-post`) - Preact

- **Adapter**: Preact with Signals
- **Bundle Size**: ~3kb JavaScript
- **Features**:
  - Lightweight interactions
  - Fast page transitions
  - Reactive counters and toggles

### ℹ️ About Page (`/about`) - Static

- **Adapter**: Static HTML
- **Features**: Pure HTML, no hydration needed

### 🎮 Demo Pages (`/demo/*`)

- **Interactive Demo** - All islands working together
- **Performance Showcase** - Side-by-side framework comparison
- **Framework Comparison** - React vs Preact implementations

## 🏝️ Island Components

### React Islands (Complex Interactions)

- **DataTable** - Sorting, filtering, selection, pagination
- **InteractiveChart** - Click handlers, hover states, animations

### Preact Islands (Lightweight)

- **Calculator** - Full calculator with Signals state
- **Timer** - Countdown timer with start/stop/reset
- **Counter** - Simple increment/decrement with Signals

### Multi-Adapter Components

- **Button** - Different implementations per framework
- **Toggle** - Shared interface, framework-specific internals

## 🔧 Key Technologies

- **🍋 Lime Framework** - View-agnostic web framework
- **⚛️ React 19** - Server Components, Server Actions, Streaming
- **⚡ Preact** - 3KB React alternative with Signals
- **📄 Static HTML** - Zero-JS rendering
- **🏗️ TypeScript** - End-to-end type safety
- **📋 Manifest System** - Build-time route discovery

## 🌟 Unique Features

### 1. **True Framework Agnosticism**

Unlike other frameworks that lock you into one view library, Lime lets you
choose the best tool for each component.

### 2. **Optimal Performance**

- Static content loads instantly
- Interactive parts load only when needed
- Right-sized JavaScript bundles per component

### 3. **Developer Experience**

- Type-safe across all frameworks
- Familiar React/Preact patterns
- Hot reloading for all adapters

### 4. **Enterprise Ready**

- Built on Lime's robust module system
- Dependency injection throughout
- Manifest-driven configuration

## 🎯 When to Use Each Adapter

| Use Case                | Recommended Adapter     | Why                                 |
| ----------------------- | ----------------------- | ----------------------------------- |
| **Landing Pages**       | Static                  | Instant loading, SEO, accessibility |
| **Simple Interactions** | Preact                  | Small bundle, fast performance      |
| **Complex UIs**         | React                   | Rich ecosystem, advanced features   |
| **Data-Heavy Pages**    | React Server Components | Server-side rendering, streaming    |
| **Forms**               | React Server Actions    | Progressive enhancement             |

## 🔄 Development Workflow

1. **Define Routes** - Register routes with preferred adapters
2. **Build Components** - Use the best framework for each use case
3. **Generate Manifests** - `deno run build.ts` discovers your modules
4. **Start Server** - Lime handles routing and rendering automatically

## 🎨 Styling Strategy

This example uses inline styles for simplicity, but in production you might use:

- **CSS Modules** - Scoped styles per component
- **Tailwind CSS** - Utility-first approach
- **Styled Components** - CSS-in-JS (React components)
- **Regular CSS** - Global styles for static components

## 🚀 Production Deployment

```bash
# Build optimized bundles
deno task build

# Deploy to Deno Deploy, Docker, or any Deno-compatible platform
# Lime handles server-side rendering and static asset serving
```

## 📈 Performance Characteristics

- **First Contentful Paint**: Instant (static content)
- **Time to Interactive**: Progressive (islands hydrate independently)
- **Bundle Size**: Optimized per component (0kb - 45kb range)
- **SEO**: Perfect (server-side rendered)
- **Accessibility**: Enhanced (progressive enhancement)

## 🎓 Learning Resources

This app demonstrates advanced concepts:

1. **Multi-Framework Architecture** - How different frameworks coexist
2. **Islands Architecture** - Selective hydration strategies
3. **Server Components** - React 19's server-side rendering
4. **Signals** - Preact's reactive state management
5. **Manifest-Driven Development** - Build-time route discovery

---

**🍋 Powered by Lime Framework** - The world's first truly view-agnostic web
framework.
