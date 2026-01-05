/**
 * Sidebar - Client Component for navigation
 * Contains Lucide icons which require client-side rendering
 */

import {
  BookOpen,
  Component,
  ExternalLink,
  Heart,
  Palette,
  Radio,
  RefreshCw,
  Server,
} from "lucide-react";

export function Sidebar() {
  return (
    <aside className="w-full lg:w-64 bg-surface border-b lg:border-b-0 lg:border-r border-neutral-200 flex-shrink-0">
      <div className="lg:sticky lg:top-0">
        {/* Logo/Brand */}
        <div className="p-4 sm:p-6 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <svg
              width="40"
              height="40"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              {/* Background circle */}
              <circle key="bg" cx="50" cy="50" r="50" fill="#7BA7D8" />

              {/* Decorative circles */}
              <circle
                key="d1"
                cx="30"
                cy="25"
                r="8"
                fill="#5B8BC4"
                opacity="0.6"
              />
              <circle
                key="d2"
                cx="22"
                cy="45"
                r="6"
                fill="#9BC4E8"
                opacity="0.5"
              />
              <circle
                key="d3"
                cx="28"
                cy="56"
                r="10"
                fill="#A8D1F0"
                opacity="0.4"
              />
              <circle
                key="d4"
                cx="65"
                cy="35"
                r="7"
                fill="#5B8BC4"
                opacity="0.5"
              />
              <circle
                key="d5"
                cx="75"
                cy="70"
                r="9"
                fill="#9BC4E8"
                opacity="0.4"
              />

              {/* Letter L - Italic/Slanted */}
              <g key="letter" transform="skewX(-10)">
                <path
                  d="M 45 18 L 57 18 L 57 65 L 80 65 L 80 78 L 45 78 Z"
                  fill="white"
                />
              </g>
            </svg>
            <div className="flex flex-col">
              <div className="text-lg font-bold text-neutral-900 leading-tight">
                laroux.js 3.0
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Interactive Demo & Guide
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="hidden lg:block p-3 sm:p-4 overflow-x-auto lg:overflow-x-visible">
          <div className="space-y-4 lg:space-y-8">
            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 px-3">
                Features
              </h3>
              <div className="space-y-1">
                <a
                  key="streaming"
                  href="#streaming"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <Radio className="w-4 h-4" />
                  <span>Streaming</span>
                </a>
                <a
                  key="server-actions"
                  href="#server-actions"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Server Actions</span>
                </a>
                <a
                  key="server-components"
                  href="#server-components"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <Server className="w-4 h-4" />
                  <span>Server Components</span>
                </a>
                <a
                  key="client-components"
                  href="#client-components"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <Component className="w-4 h-4" />
                  <span>Island Architecture</span>
                </a>
                <a
                  key="styling"
                  href="#styling"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <Palette className="w-4 h-4" />
                  <span>Styling</span>
                </a>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3 px-3">
                Resources
              </h3>
              <div className="space-y-1">
                <a
                  href="https://react.dev/blog/2023/03/22/react-labs-what-we-have-been-working-on-march-2023#react-server-components"
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>RSC Documentation</span>
                  <ExternalLink
                    className="w-3 h-3 opacity-60"
                    strokeWidth={2}
                  />
                </a>
              </div>
            </div>

            <div className="pt-4 border-t border-neutral-200">
              <div className="text-xs text-neutral-500 space-y-1">
                <div className="flex items-center gap-1">
                  <span>Built with</span>
                  <Heart
                    className="w-3 h-3 text-danger-500 fill-danger-500"
                    fill="currentColor"
                  />
                  <span>by</span>
                  <a
                    href="https://eser.dev"
                    target="_blank"
                    rel="noopener"
                    className="font-semibold"
                  >
                    @eser
                  </a>
                </div>
                <div>
                  using <span className="font-semibold">Deno 2.x</span> and{" "}
                  <span className="font-semibold">React 19.x</span>
                </div>
              </div>
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
}
