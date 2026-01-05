/**
 * Home Page - Landing page with demos
 * Server Component
 */

import { Suspense } from "react";
import {
  CircleCheckBig,
  Component,
  Gauge,
  Package,
  Palette,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import { Counter } from "../../counter.tsx";
import { Comments } from "../../comments.tsx";
import { ServerData } from "../../server-data.tsx";
import { SlowData } from "../../slow-data.tsx";
import { Loading } from "../../loading.tsx";
import { StylingDemo } from "../../styling-demo.tsx";

export function HomePage() {
  return (
    <>
      {/* Hero Section - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-12 lg:mb-20">
        {/* Left Column - Hero Content */}
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight bg-linear-to-r from-primary-600 via-primary-500 to-neutral-600 bg-clip-text text-transparent">
            laroux.js 3.0
          </h1>
          <p className="text-base sm:text-lg lg:text-xl text-neutral-600 mb-4 leading-relaxed">
            Zero-configuration React Server Components on Deno 2.x. Modern,
            simple, and built with cutting-edge technology.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <a
              key="demos"
              href="#streaming"
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
            >
              View demos
            </a>
            <a
              key="github"
              href="https://github.com/eser/stack"
              target="_blank"
              rel="noopener"
              className="px-6 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 font-semibold rounded-lg transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Right Column - Info Panel */}
        <div className="bg-surface rounded-lg border border-neutral-200 p-8 shadow-sm">
          <h2 className="text-lg font-bold text-neutral-900 mb-4">
            Why laroux.js?
          </h2>
          <div className="space-y-4 text-sm text-neutral-700">
            <div key="zero-config" className="flex gap-3">
              <Zap className="w-6 h-6 text-primary-600" />
              <div>
                <strong className="text-neutral-900 font-semibold">
                  Zero Configuration
                </strong>
                <p className="text-neutral-600 mt-1">
                  No config files, no setup — just start building
                </p>
              </div>
            </div>
            <div key="deno" className="flex gap-3">
              <Shield className="w-6 h-6 text-primary-600" />
              <div>
                <strong className="text-neutral-900 font-semibold">
                  Deno 2.x Runtime
                </strong>
                <p className="text-neutral-600 mt-1">
                  Native TypeScript, security by default, all-in-one tooling
                </p>
              </div>
            </div>
            <div key="rsc" className="flex gap-3">
              <Server className="w-6 h-6 text-primary-600" />
              <div>
                <strong className="text-neutral-900 font-semibold">
                  React Server Components
                </strong>
                <p className="text-neutral-600 mt-1">
                  Type-safe server components with direct backend access
                </p>
              </div>
            </div>
            <div key="fast" className="flex gap-3">
              <Gauge className="w-6 h-6 text-primary-600" />
              <div>
                <strong className="text-neutral-900 font-semibold">
                  Lightning Fast
                </strong>
                <p className="text-neutral-600 mt-1">
                  Progressive loading, optimized builds, and tree-shaking
                </p>
              </div>
            </div>
            <div key="batteries" className="flex gap-3">
              <Package className="w-6 h-6 text-primary-600" />
              <div>
                <strong className="text-neutral-900 font-semibold">
                  Batteries Included
                </strong>
                <p className="text-neutral-600 mt-1">
                  Styling, server actions, and more — all built-in
                </p>
              </div>
            </div>
            <div
              key="status"
              className="px-3 py-2 bg-success-50 border border-success-200 rounded-md mt-4"
            >
              <p className="text-xs text-success-900 font-medium">
                ✓ Production-ready • 37+ passing tests
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-12">
        {/* Streaming Section */}
        <section key="streaming" id="streaming" className="scroll-mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <Radio className="w-6 h-6" /> Streaming
            </h2>
            <div className="mb-3 flex items-center gap-1 text-xs text-neutral-700">
              Components are streamed progressively without blocking other
              content.
            </div>
            <p className="text-base text-neutral-600 leading-relaxed mb-4">
              React 19.x's Suspense boundaries enable progressive rendering. The
              page shows content immediately while slower components stream in.
              Users see immediate feedback instead of waiting for everything to
              load.
            </p>
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                Benefits:
              </h3>
              <ul className="text-sm text-neutral-700 space-y-1 list-disc list-inside">
                <li>Show content immediately, load slow parts later</li>
                <li>Better perceived performance</li>
                <li>Parallel data fetching</li>
                <li>Graceful loading states</li>
              </ul>
            </div>
          </div>

          <div className="bg-surface rounded-lg border border-neutral-200 px-5 py-4 shadow-sm space-y-3">
            <h4 className="text-lg font-semibold text-neutral-900 mb-4">
              Streaming Demo
            </h4>

            <div className="bg-success-700 rounded-md border border-neutral-200 p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <CircleCheckBig
                  className="w-8 h-8 text-white"
                  strokeWidth={1}
                />
                <div>
                  <h5 className="text-sm font-bold text-white">
                    Instant Component
                  </h5>
                  <p className="text-xs text-white">
                    This rendered immediately with no delay
                  </p>
                </div>
              </div>
            </div>

            <Suspense
              fallback={<Loading message="Loading slow data (10s)..." />}
            >
              <SlowData delay={10000} />
            </Suspense>

            <Suspense
              fallback={<Loading message="Loading more data (20s)..." />}
            >
              <SlowData delay={20000} />
            </Suspense>

            <Suspense
              fallback={<Loading message="Loading more data (40s)..." />}
            >
              <SlowData delay={40000} />
            </Suspense>
          </div>
        </section>

        <hr className="border-t border-neutral-200" />

        {/* Server Actions Section */}
        <section
          key="server-actions"
          id="server-actions"
          className="scroll-mt-8"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <RefreshCw className="w-6 h-6" /> Server Actions
            </h2>
            <div className="mb-3 flex items-center gap-1 text-xs text-neutral-700">
              Form data sent to server with{" "}
              <code className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono text-xs">
                use server
              </code>{" "}
              — no API endpoints needed.
            </div>
            <p className="text-base text-neutral-600 leading-relaxed mb-4">
              Server Actions are asynchronous functions that run on the server.
              They're called from Client Components but execute on the server,
              eliminating the need for API routes. Mark them with the
              <code className="px-1.5 py-0.5 mx-1 bg-neutral-100 rounded text-sm font-mono">
                "use server"
              </code>
              directive.
            </p>
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                Use Cases:
              </h3>
              <ul className="text-sm text-neutral-700 space-y-1 list-disc list-inside">
                <li>Form submissions and data mutations</li>
                <li>Database operations</li>
                <li>Server-side validation</li>
                <li>No need to create API endpoints manually</li>
              </ul>
            </div>
          </div>
          <Comments />
        </section>

        <hr className="border-t border-neutral-200" />

        {/* Server Component Section */}
        <section
          key="server-components"
          id="server-components"
          className="scroll-mt-8"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <Server className="w-6 h-6" /> Server Components
            </h2>
            <div className="mb-3 flex items-center gap-1 text-xs text-neutral-700">
              Runs with{" "}
              <code className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono text-xs">
                async/await
              </code>{" "}
              — fetched data never touches client bundle.
            </div>
            <p className="text-base text-neutral-600 leading-relaxed mb-4">
              Server Components run only on the server and never ship to the
              client. They can access databases, read files, and perform other
              server-side operations directly. Their code doesn't add to your
              JavaScript bundle size.
            </p>
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                Key Benefits:
              </h3>
              <ul className="text-sm text-neutral-700 space-y-1 list-disc list-inside">
                <li>
                  Zero client bundle impact - code stays on the server
                </li>
                <li>
                  Direct access to backend resources (databases, filesystems,
                  APIs)
                </li>
                <li>
                  Automatic code splitting without manual configuration
                </li>
                <li>Can use async/await for data fetching</li>
              </ul>
            </div>
          </div>
          <ServerData />
        </section>

        <hr className="border-t border-neutral-200" />

        {/* Client Component Section */}
        <section
          key="client-components"
          id="client-components"
          className="scroll-mt-8"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <Component className="w-6 h-6" /> Island Architecture
            </h2>
            <div className="mb-3 flex items-center gap-1 text-xs text-neutral-700">
              Uses{" "}
              <code className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono text-xs">
                use client
              </code>{" "}
              directive with{" "}
              <code className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono text-xs">
                useState
              </code>{" "}
              for browser interactivity.
            </div>
            <p className="text-base text-neutral-600 leading-relaxed mb-4">
              Island Architecture makes marked components to be interactive and
              run in the browser. These components use React hooks like
              <code className="px-1.5 py-0.5 mx-1 bg-neutral-100 rounded text-sm font-mono">
                useState
              </code>
              and can respond to user interactions. Mark them with the
              <code className="px-1.5 py-0.5 mx-1 bg-neutral-100 rounded text-sm font-mono">
                "use client"
              </code>
              directive at the top of the file.
            </p>
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                When to Use:
              </h3>
              <ul className="text-sm text-neutral-700 space-y-1 list-disc list-inside">
                <li>Interactive UI elements (buttons, forms, modals)</li>
                <li>Browser APIs (localStorage, geolocation, etc.)</li>
                <li>State management with hooks</li>
                <li>Event handlers and user input</li>
              </ul>
            </div>
          </div>
          <Counter />
        </section>

        <hr className="border-t border-neutral-200" />

        {/* Styling Section */}
        <section key="styling" id="styling" className="scroll-mt-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-neutral-900 mb-3 flex items-center gap-2">
              <Palette className="w-6 h-6" /> Styling
            </h2>
            <div className="mb-3 flex items-center gap-1 text-xs text-neutral-700">
              Modern CSS with{" "}
              <code className="px-1.5 py-0.5 bg-white border border-neutral-200 rounded font-mono text-xs">
                .module.css
              </code>{" "}
              scoped styles, Tailwind utilities, and native nesting.
            </div>
            <p className="text-base text-neutral-600 leading-relaxed mb-4">
              laroux.js provides a complete styling solution combining CSS
              Modules, Tailwind CSS, and Lightning CSS. Write scoped component
              styles with native CSS nesting syntax, or use Tailwind utilities -
              or mix both! Automatic tree-shaking removes unused CSS for optimal
              bundle sizes.
            </p>
            <div className="bg-neutral-100 border border-neutral-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-neutral-900 mb-2">
                Features:
              </h3>
              <ul className="text-sm text-neutral-700 space-y-1 list-disc list-inside">
                <li>CSS Modules with scoped class names</li>
                <li>Native CSS nesting (no preprocessor needed)</li>
                <li>Tailwind utilities with automatic tree-shaking</li>
                <li>Lightning CSS for ultra-fast processing</li>
                <li>Optional TypeScript .d.ts generation</li>
                <li>Advanced minification and optimization</li>
              </ul>
            </div>
          </div>
          <StylingDemo />
        </section>
      </div>
    </>
  );
}
