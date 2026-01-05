/**
 * laroux.js Configuration
 *
 * This file is optional. If not present, sensible defaults will be used.
 * Uncomment and modify options as needed for your project.
 */

import type { UserConfig } from "@eser/laroux-core/config/schema";

const config: UserConfig = {
  // Server configuration
  // server: {
  //   host: "localhost",
  //   port: 8000,
  //   hmr: true,
  //   open: false,
  // },

  // SSR configuration with streaming-optimal mode
  ssr: {
    mode: "always",
    streamMode: "streaming-optimal",
  },

  // RSC (React Server Components) configuration
  // Controls how the client handles element keys during hydration
  // rsc: {
  //   keys: "auto-generate", // "auto-generate" | "static"
  //   // "auto-generate" (default): Add synthetic keys (__rsc_0, __rsc_1) to elements
  //   // "static": Use React.Children.toArray() which treats children as static
  // },

  // Build configuration
  // build: {
  //   minify: true,
  //   sourcemap: true,
  //   target: ["es2022"],
  //   external: [],
  // },

  // Directory paths (relative to project root)
  // srcDir: "src",
  // distDir: "dist",
  // publicDir: "public",

  // Logging
  // logLevel: "info", // "trace" | "debug" | "info" | "warn" | "error" | "fatal"

  // Path aliases
  // alias: {
  //   "@components": "./src/components",
  //   "@utils": "./src/utils",
  // },

  // Environment variables to expose to client
  // env: {
  //   API_URL: process.env.API_URL || "http://localhost:3000",
  // },

  // Font configuration
  fonts: [
    {
      provider: "google",
      family: "Open Sans",
      weights: ["400", "500", "600", "700"],
      styles: ["normal"],
      display: "swap",
      subsets: ["latin", "latin-ext"],
      variable: "--font-sans",
      fallback: [
        "system-ui",
        "-apple-system",
        "BlinkMacSystemFont",
        "Segoe UI",
        "Roboto",
        "sans-serif",
      ],
    },
  ],
};

export default config;
