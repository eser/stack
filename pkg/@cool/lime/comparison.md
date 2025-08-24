# Fresh vs Lime Framework Comparison Matrix

## Critical Architectural Difference

### JSX Runtime Strategy - View-Agnostic Like Astro

**This is the most fundamental difference between Fresh and Lime:**

- **Fresh**: Tightly coupled to Preact. The entire framework is built around
  Preact's virtual DOM, components, and rendering system.
- **Lime**: View-agnostic framework (like Astro) that treats React, Preact, and
  other libraries as adapters.

#### Lime's View-Agnostic Architecture:

1. **Adapter Pattern**: React and Preact are just adapters, not core
   dependencies
2. **Multi-Framework Support**: Can use different frameworks in the same app
   (React for some islands, Preact for others)
3. **React 19 Features**: Full support for React Server Components (RSC) and
   Server Actions
4. **JSX Runtime Flexibility**: Uses `@eser/jsx-runtime` as a base with
   pluggable implementations
5. **Progressive Enhancement**: Can render static HTML with selective hydration
   using any framework

This means Lime can:

- Run React Server Components alongside Preact islands
- Support React 19's Server Actions for form handling and mutations
- Mix and match frameworks based on component needs (React for complex state,
  Preact for lightweight interactions)
- Support future view libraries (Vue, Solid, Svelte) through adapters
- Render pure HTML with no JavaScript when needed

## Architecture & Core Design

| Feature                  | Fresh                           | Lime                                   | Notes                                          |
| ------------------------ | ------------------------------- | -------------------------------------- | ---------------------------------------------- |
| **Base Runtime**         | Custom App class                | AppRuntime (extends @eser/app-runtime) | Lime builds on existing runtime infrastructure |
| **Configuration**        | FreshConfig with basePath, mode | LimeOptions with basePath + LimeState  | Lime uses state-based configuration            |
| **Dependency Injection** | No built-in DI                  | Built-in DI via @eser/di               | Lime has enterprise-ready DI                   |
| **Module System**        | File-based modules              | Module interface with manifest support | Lime supports lazy-loading modules             |
| **Event System**         | No centralized events           | Events via @eser/events                | Lime has built-in event handling               |
| **Run Modes**            | development/production          | RunModes flags (bitwise)               | Lime has more flexible run modes               |

## Routing & Navigation

| Feature                | Fresh                        | Lime                                  | Notes                                        |
| ---------------------- | ---------------------------- | ------------------------------------- | -------------------------------------------- |
| **Router Type**        | URLPattern-based router      | Not yet implemented                   | Fresh has mature routing                     |
| **File-based Routing** | ✅ Full support with /routes | 🔄 Manifest-based via @eser/collector | **Different approach - Lime uses manifests** |
| **Dynamic Routes**     | [param].tsx, [...rest].tsx   | ❌ Not implemented                    | Need to add                                  |
| **Route Groups**       | (group) syntax               | ❌ Not implemented                    | Organizational feature                       |
| **Nested Layouts**     | _layout.tsx with inheritance | ❌ Not implemented                    | Important for DX                             |
| **Error Pages**        | _error.tsx, _404.tsx         | ❌ Not implemented                    | Error handling                               |
| **Route Middleware**   | _middleware.ts files         | Module-based middleware               | Different approach                           |

## Rendering & UI

| Feature                     | Fresh                         | Lime                                  | Notes                                       |
| --------------------------- | ----------------------------- | ------------------------------------- | ------------------------------------------- |
| **View Engine**             | Preact only                   | View-agnostic (React, Preact, etc.)   | **Like Astro - adapters for any framework** |
| **JSX Approach**            | Preact JSX                    | JSX precompile with pluggable runtime | Lime is more flexible                       |
| **SSR**                     | ✅ Full SSR (Preact)          | ⚠️ Needs impl for adapters            | Need SSR for each adapter                   |
| **React Server Components** | ❌ Not supported              | 🎯 Planned with React 19              | Major advantage for Lime                    |
| **Server Actions**          | ❌ Not supported              | 🎯 Planned with React 19              | Form handling & mutations                   |
| **Islands Architecture**    | ✅ Preact islands only        | 🎯 Multi-framework islands            | Can mix React & Preact islands              |
| **Partials**                | ✅ HTMX-style updates         | ❌ Not implemented                    | Modern UX pattern                           |
| **App Wrapper**             | _app.tsx component            | ❌ Not implemented                    | Global layout                               |
| **Async Components**        | ✅ Server components (Preact) | 🎯 RSC + Preact async                 | Better with React 19                        |

## Development Experience

| Feature           | Fresh                     | Lime                    | Notes                       |
| ----------------- | ------------------------- | ----------------------- | --------------------------- |
| **Dev Server**    | Built-in with live reload | ❌ Not implemented      | Critical for DX             |
| **Error Overlay** | Rich error display        | ❌ Not implemented      | Development aid             |
| **HMR**           | ✅ Hot Module Replacement | ❌ Not implemented      | Fast iteration              |
| **Build System**  | ESBuild integration       | @eser/bundler (ESBuild) | Similar foundation          |
| **TypeScript**    | Full support              | Full support            | Both have TS                |
| **Testing Utils** | Test helpers included     | Standard Deno testing   | Fresh has specialized utils |

## Middleware & Plugins

| Feature                  | Fresh                                | Lime                  | Notes                   |
| ------------------------ | ------------------------------------ | --------------------- | ----------------------- |
| **Middleware Chain**     | Composable middlewares               | Module-based approach | Different patterns      |
| **Built-in Middlewares** | CORS, CSRF, static, trailing slashes | ❌ Not included       | Need to port            |
| **Plugin System**        | Plugin interface                     | Module system         | Different extensibility |
| **Static Files**         | staticFiles middleware               | ❌ Not implemented    | Basic feature           |
| **CORS Support**         | cors middleware                      | ❌ Not implemented    | Security feature        |
| **CSRF Protection**      | csrf middleware                      | ❌ Not implemented    | Security feature        |

## Data & State Management

| Feature              | Fresh                  | Lime                        | Notes                |
| -------------------- | ---------------------- | --------------------------- | -------------------- |
| **Context Object**   | Unified Context class  | State in AppRuntime         | Different approaches |
| **State Sharing**    | Via context.state      | Via DI container            | Lime more flexible   |
| **Data Fetching**    | In handlers/components | ❌ Not defined              | Need pattern         |
| **Manifest Support** | ❌ No manifests        | ✅ YAML/JSON/TOML manifests | Lime advantage       |
| **Service Registry** | ❌ Not available       | ✅ DI-based services        | Lime advantage       |

## Build & Deployment

| Feature              | Fresh                    | Lime                 | Notes               |
| -------------------- | ------------------------ | -------------------- | ------------------- |
| **Build Cache**      | BuildCache system        | ❌ Not implemented   | Performance feature |
| **Asset Management** | Asset versioning/hashing | ❌ Not implemented   | Cache busting       |
| **Production Build** | Optimized builds         | Basic bundling       | Fresh more mature   |
| **Deno Deploy**      | ✅ First-class support   | ⚠️ Should work       | Fresh optimized     |
| **Docker Support**   | ✅ Documented            | ✅ Dockerfile exists | Both support        |

## View Framework Adapter Architecture

### Lime's Adapter System (Like Astro)

| Adapter            | Features                                           | Use Cases                               |
| ------------------ | -------------------------------------------------- | --------------------------------------- |
| **React Adapter**  | RSC, Server Actions, Suspense, Concurrent Features | Complex apps, forms, real-time updates  |
| **Preact Adapter** | Lightweight, Fast hydration, Signals               | Performance-critical, small bundle size |
| **Static Adapter** | No JS, Pure HTML                                   | Documentation, blogs, landing pages     |
| **Vue Adapter**    | 🔮 Future                                          | Vue ecosystem compatibility             |
| **Solid Adapter**  | 🔮 Future                                          | Fine-grained reactivity needs           |

### Component Declaration Examples

```typescript
// React Server Component
"use server"; // or component.adapter = 'react-server'
export default async function UserProfile() {}

// React Client Component
"use client"; // or component.adapter = 'react'
export default function InteractiveChart() {}

// Preact Island
// component.adapter = 'preact'
export default function LightweightToggle() {}

// Static HTML (no hydration)
// component.adapter = 'static'
export default function Footer() {}
```

## Unique Features

### Fresh Unique Features

- **Islands Architecture**: Selective client-side hydration
- **Partials System**: Server-rendered partial updates
- **File-based Routing**: Automatic route discovery
- **Error Overlay**: Rich development error display
- **Live Reload**: WebSocket-based auto-refresh
- **Route Commands**: Abstract command pattern for routes
- **Update Check**: Version update notifications

### Lime Unique Features

- **View-Agnostic Architecture**: Like Astro, supports multiple frameworks via
  adapters
- **React 19 Support**: Server Components and Server Actions
- **Multi-Framework Islands**: Mix React and Preact in the same app
- **Dependency Injection**: Enterprise-grade DI container
- **Module System**: Lazy-loadable modules with manifests
- **Event System**: Centralized event handling
- **Manifest Loading**: Multi-format configuration (YAML/JSON/TOML)
- **Functional Programming**: Built-in FP utilities (@eser/fp)
- **Standards Compliance**: Uses @eser/standards
- **Logging System**: Structured logging (@eser/logging)

## Implementation Priority

### High Priority (Core Features)

1. **Adapter Architecture** - Foundation for view-agnostic design
2. **File-based Routing System** - Foundation for Fresh compatibility
3. **SSR with Adapters** - React RSC, Preact SSR, Static rendering
4. **Development Server** - Critical for developer experience
5. **Middleware System** - Core architectural pattern
6. **Context & Request Handling** - Request lifecycle management

### Medium Priority (Enhanced Features)

7. **React Server Components** - React 19 feature implementation
8. **Server Actions** - Form handling and mutations
9. **Multi-Framework Islands** - Mix React & Preact components
10. **Layouts & Nested Routing** - Better organization
11. **Error Handling & Pages** - User experience
12. **Static File Serving** - Basic web serving
13. **Build Cache System** - Performance improvement

### Low Priority (Nice-to-Have)

14. **Partials System** - Advanced UX pattern
15. **Error Overlay** - Development enhancement
16. **HMR/Live Reload** - Development speed
17. **CORS/CSRF Middlewares** - Security features
18. **Testing Utilities** - Testing improvements
19. **Additional Adapters** - Vue, Solid, Svelte support

## Migration Strategy

### Phase 1: Adapter Foundation

- Create adapter architecture (React, Preact, Static)
- Implement adapter detection and loading
- Set up component type abstractions
- Create unified SSR interface

### Phase 2: Core Routing & Context

- Implement basic routing system (adapter-agnostic)
- Add file-based routing
- Create development server
- Port middleware architecture

### Phase 3: React 19 Features

- Implement React Server Components support
- Add Server Actions for forms
- Set up streaming SSR
- Configure React 19 specific optimizations

### Phase 4: Multi-Framework Islands

- Implement Islands architecture for all adapters
- Support mixed React/Preact islands
- Add selective hydration
- Optimize client bundle splitting

### Phase 5: Fresh Feature Parity

- Add layouts and error pages
- Implement Partials system
- Port essential middlewares
- Enhance development experience

### Phase 6: Polish & Extensions

- Add more adapters (Vue, Solid)
- Implement testing utilities
- Performance optimizations
- Documentation and examples

## Technical Decisions to Maintain

### Lime's Core Values to Preserve

1. **View-Agnostic Design**: Treat ALL view libraries as adapters (like Astro)
2. **React 19 First-Class**: Full support for Server Components & Actions
3. **Multi-Framework Islands**: Allow mixing frameworks in one app
4. **Module-based Architecture**: Keep the module system as the foundation
5. **Dependency Injection**: Maintain DI as a core feature
6. **Event-Driven Design**: Keep the event system
7. **Configuration Flexibility**: Support multiple config formats
8. **Standards Compliance**: Continue using @eser packages
9. **JSX Runtime Flexibility**: Keep the pluggable JSX runtime approach

### Fresh Features to Adapt (Not Copy)

1. **Routing**: Adapt file-based routing to work with modules
2. **Islands**: Implement Islands architecture that works with both React and
   Preact
3. **Middleware**: Bridge Fresh-style middlewares with Lime modules
4. **Context**: Merge Fresh's Context with Lime's State
5. **Build System**: Enhance existing bundler with Fresh's optimizations
6. **SSR**: Implement SSR that supports both React and Preact rendering

## Compatibility Considerations

### API Compatibility Goals

- Support Fresh-style route handlers where possible
- Allow Fresh middleware to work with adapters
- Maintain similar file structure conventions
- Compatible TypeScript types for easy migration

### Breaking Changes to Accept

- Different core runtime (AppRuntime vs App)
- Module-based vs file-based configuration
- DI-based state vs context-based state
- Different JSX runtime implementation

## Implementation Challenges & Solutions

### Challenge 1: Multi-Framework Islands

- **Problem**: Different hydration methods for React, Preact, etc.
- **Solution**: Adapter pattern with framework detection
- **Implementation**: Each adapter provides its own hydration strategy

### Challenge 2: React Server Components Integration

- **Problem**: RSC requires special bundling and streaming
- **Solution**: Integrate React's RSC bundler with Lime's build system
- **Implementation**: Use React 19's built-in RSC support with custom
  integration

### Challenge 3: Mixed Framework Routing

- **Problem**: Different frameworks in the same route tree
- **Solution**: Route-level adapter configuration
- **Implementation**: Tag routes with their required adapter

### Challenge 4: Server Actions Security

- **Problem**: Server Actions need secure RPC implementation
- **Solution**: Use React 19's built-in security with additional validation
- **Implementation**: Integrate with Lime's middleware for auth/validation

### Challenge 5: Bundle Optimization

- **Problem**: Multiple frameworks increase bundle size
- **Solution**: Smart code splitting per adapter
- **Implementation**: Separate bundles for React/Preact islands

## Conclusion

Lime's vision is to become a truly view-agnostic framework like Astro, where
React, Preact, and other libraries are just adapters. By adopting Fresh's proven
patterns (routing, islands, SSR) while maintaining Lime's architectural
advantages (modules, DI, events) and adding cutting-edge features like React
Server Components and Server Actions, Lime can offer:

1. **Ultimate Flexibility**: Use React for complex interactions, Preact for
   performance, or mix both
2. **Modern Features**: Full React 19 support with RSC and Server Actions
3. **Performance**: Choose the right tool for each component (heavy React vs
   light Preact)
4. **Future-Proof**: Easy to add new framework adapters as the ecosystem evolves
5. **Developer Experience**: Fresh's great DX with more framework choices

This positions Lime as the most flexible and modern web framework, combining
Fresh's simplicity, Astro's flexibility, and Next.js's React 19 features in a
single, cohesive platform.
