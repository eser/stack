// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HTML Shell Template
 * Provides the initial HTML structure for the React app with embedded chunk manifest
 */

import type { ChunkManifest } from "@eserstack/laroux-bundler";
import type { SeoConfig } from "./seo/index.ts";
import { generateJsonLd, generateMetaTags } from "./seo/index.ts";

// Default SEO configuration for laroux.now
const DEFAULT_SEO_CONFIG: SeoConfig = {
  title: "laroux.js 3.0",
  description:
    "Zero-configuration React Server Components on Deno 2.x. Modern, simple, and built with cutting-edge technology.",
  siteName: "laroux.js",
  siteUrl: "https://laroux.now",
  locale: "en_US",
  themeColor: "#7c3aed",
  favicon: "/favicon.svg",
  twitterHandle: "@eser",
  ogImage: "https://laroux.now/og-image.png",
  ogType: "website",
  keywords: [
    "laroux",
    "open source",
    "community",
    "development",
    "react",
    "server components",
    "server actions",
    "island architecture",
  ],
  author: "Eser Ozvataf",
};

/**
 * Options for generating the HTML shell
 */
export type HtmlShellOptions = {
  /** Chunk manifest with component mappings */
  chunkManifest: ChunkManifest;
  /** Entry point script path */
  entrypoint: string;
  /** Font preload hints (optional) */
  fontPreloads?: string[];
  /** Font face CSS (optional) */
  fontCSS?: string;
  /** SEO configuration override (optional) */
  seoConfig?: Partial<SeoConfig>;
  /** Current locale (optional) */
  locale?: string;
  /** Critical chunks to preload (optional) */
  criticalChunks?: string[];
  /** Critical page-specific CSS (optional, extracted layout utilities for the page) */
  criticalPageCSS?: string;
  /** Critical universal CSS (optional, base styles extracted from theme at build time) */
  criticalUniversalCSS?: string;
  /** Deferred CSS path to load async (optional) */
  deferredCSSPath?: string;
  /** Server-rendered HTML content (SSR) */
  ssrContent?: string;
  /** RSC payload for hydration (JSON-serialized chunks) */
  rscPayload?: string;
  /** Client component modules to preload */
  clientModules?: string[];
};

/**
 * Options for streaming HTML shell (streaming-optimal mode)
 */
export type StreamingHtmlShellOptions = HtmlShellOptions & {
  /** Bootstrap script for inline RSC chunks */
  inlineBootstrapScript?: string;
};

/**
 * Create the START portion of streaming HTML shell
 * Returns everything up to and including <div id="root">
 *
 * This is sent immediately when streaming begins, allowing the browser
 * to start parsing and rendering before async content resolves.
 */
export function createStreamingHtmlShellStart(
  options: StreamingHtmlShellOptions,
): string {
  const entrypoint = options.entrypoint ?? "/client.js";

  // Use buildId for cache busting
  const cacheBuster = options.chunkManifest?.buildId
    ? `?v=${options.chunkManifest.buildId}`
    : `?v=${Date.now()}`;

  const cssCacheBuster = options.chunkManifest?.hmrEnabled ? "" : cacheBuster;

  // Generate font preload hints
  const fontPreloadHints = options.fontPreloads?.join("\n  ") ?? "";

  // Generate inline font CSS
  const inlineFontCSS = options.fontCSS
    ? `<style>${options.fontCSS}</style>`
    : "";

  // Generate critical chunk preload hints
  const criticalChunkPreloads = options.criticalChunks
    ?.map((chunk) => `<link rel="modulepreload" href="${chunk}${cacheBuster}">`)
    .join("\n  ") ?? "";

  // Generate client module preloads
  const clientModulePreloads = options.clientModules
    ?.map((moduleId) => {
      const chunkInfo = options.chunkManifest?.chunks?.[moduleId];
      if (chunkInfo && "main" in chunkInfo) {
        return `<link rel="modulepreload" href="/chunk-${chunkInfo.main}.js${cacheBuster}">`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n  ") ?? "";

  // Critical Universal CSS - dynamically extracted from compiled CSS at build time
  // Fallback is minimal (scrollbar-gutter + box-sizing) - real styles come from compiled CSS
  // NOTE: No hardcoded body/heading/a/button styles - these are extracted dynamically
  // to respect the app's global.css and prevent conflicts with @layer utilities
  const defaultUniversalCSS =
    `html{scrollbar-gutter:stable}*,*::before,*::after{box-sizing:border-box}`;

  const criticalUniversalCSS = options.criticalUniversalCSS ||
    defaultUniversalCSS;

  // Combine universal CSS (base/theme) with page CSS (layout utilities)
  const combinedCSS = options.criticalPageCSS
    ? `${criticalUniversalCSS}${options.criticalPageCSS}`
    : criticalUniversalCSS;

  const inlineCriticalCSS = `<style id="critical-css">${combinedCSS}</style>`;

  // Deferred CSS loader - use media="print" pattern for proper async loading
  // The preload hints the browser to fetch early, then the stylesheet link with media="print"
  // doesn't block rendering. When loaded, we switch to media="all" to apply the styles.
  const deferredCSSLoader = options.deferredCSSPath
    ? `<link rel="stylesheet" href="${options.deferredCSSPath}${cssCacheBuster}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${options.deferredCSSPath}${cssCacheBuster}"></noscript>`
    : "";

  // SEO config
  const seoConfig: SeoConfig = {
    ...DEFAULT_SEO_CONFIG,
    ...options.seoConfig,
  };

  const metaTags = generateMetaTags(seoConfig);
  const jsonLd = generateJsonLd(seoConfig);

  const lang = options.locale?.split("_")[0] ??
    seoConfig.locale?.split("_")[0] ?? "en";

  const cssPreload = options.deferredCSSPath
    ? `<link rel="preload" href="${options.deferredCSSPath}${cssCacheBuster}" as="style">`
    : `<link rel="preload" href="/styles.css${cssCacheBuster}" as="style">`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  ${cssPreload}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${metaTags}
  <title>${seoConfig.title}</title>
  ${fontPreloadHints}
  ${inlineFontCSS}
  ${inlineCriticalCSS}
  ${
    options.deferredCSSPath
      ? deferredCSSLoader
      : `<link rel="stylesheet" href="/styles.css${cssCacheBuster}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/styles.css${cssCacheBuster}"></noscript>`
  }
  <link rel="modulepreload" href="${entrypoint}${cacheBuster}">
  ${criticalChunkPreloads}
  ${clientModulePreloads}
  ${jsonLd}
</head>
<body>
  <div id="root">`;
}

/**
 * Create the END portion of streaming HTML shell
 * Just closes the HTML structure - manifest and client script are sent earlier
 * (before RSC chunks) to enable progressive chunk processing.
 *
 * This is sent after all streamed content (HTML + inline RSC chunks) is complete.
 */
export function createStreamingHtmlShellEnd(
  _options: StreamingHtmlShellOptions,
): string {
  // Manifest and client script are now sent RIGHT AFTER the bootstrap script
  // (before RSC chunks stream) in server.ts createStreamingOptimalResponse.
  // This allows the client to load in parallel and process chunks progressively.
  return `</div>
</body>
</html>`;
}

/**
 * Create HTML shell with embedded chunk manifest and RSC client bootstrap
 * @param options - Configuration options for HTML generation
 * @returns Complete HTML document as string
 */
export function createHtmlShell(options: HtmlShellOptions): string {
  const entrypoint = options.entrypoint ?? "/client.js";

  const manifestScript = options.chunkManifest
    ? `<script>globalThis.__CHUNK_MANIFEST__ = ${
      JSON.stringify(options.chunkManifest)
    };</script>`
    : "";

  // Use buildId for cache busting (more stable than timestamp)
  const cacheBuster = options.chunkManifest?.buildId
    ? `?v=${options.chunkManifest.buildId}`
    : `?v=${Date.now()}`;

  // Skip CSS cache-busting in HMR mode (HMR client handles CSS reloading)
  const cssCacheBuster = options.chunkManifest?.hmrEnabled ? "" : cacheBuster;

  // Generate font preload hints
  const fontPreloadHints = options.fontPreloads?.join("\n  ") ?? "";

  // Generate inline font CSS
  const inlineFontCSS = options.fontCSS
    ? `<style>${options.fontCSS}</style>`
    : "";

  // Generate critical chunk preload hints for faster loading
  const criticalChunkPreloads = options.criticalChunks
    ?.map((chunk) => `<link rel="modulepreload" href="${chunk}${cacheBuster}">`)
    .join("\n  ") ?? "";

  // Generate client module preloads for SSR hydration
  const clientModulePreloads = options.clientModules
    ?.map((moduleId) => {
      // Look up the module in chunk manifest to get actual chunk file
      const chunkInfo = options.chunkManifest?.chunks?.[moduleId];
      if (chunkInfo && "main" in chunkInfo) {
        return `<link rel="modulepreload" href="/chunk-${chunkInfo.main}.js${cacheBuster}">`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n  ") ?? "";

  // Critical Universal CSS - dynamically extracted from compiled CSS at build time
  // Fallback is minimal (scrollbar-gutter + box-sizing) - real styles come from compiled CSS
  // NOTE: No hardcoded body/heading/a/button styles - these are extracted dynamically
  // to respect the app's global.css and prevent conflicts with @layer utilities
  const defaultUniversalCSS =
    `html{scrollbar-gutter:stable}*,*::before,*::after{box-sizing:border-box}`;

  const criticalUniversalCSS = options.criticalUniversalCSS ||
    defaultUniversalCSS;

  // Combine universal CSS (base/theme) with page CSS (layout utilities)
  const combinedCSS = options.criticalPageCSS
    ? `${criticalUniversalCSS}${options.criticalPageCSS}`
    : criticalUniversalCSS;

  const inlineCriticalCSS = `<style id="critical-css">${combinedCSS}</style>`;

  // Deferred CSS loader - use media="print" pattern for proper async loading
  const deferredCSSLoader = options.deferredCSSPath
    ? `<link rel="stylesheet" href="${options.deferredCSSPath}${cssCacheBuster}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${options.deferredCSSPath}${cssCacheBuster}"></noscript>`
    : "";

  // Merge SEO config with defaults
  const seoConfig: SeoConfig = {
    ...DEFAULT_SEO_CONFIG,
    ...options.seoConfig,
  };

  // Generate SEO meta tags and JSON-LD
  const metaTags = generateMetaTags(seoConfig);
  const jsonLd = generateJsonLd(seoConfig);

  // Determine language from locale
  const lang = options.locale?.split("_")[0] ??
    seoConfig.locale?.split("_")[0] ?? "en";

  // Generate CSS preload (early discovery for faster loading)
  const cssPreload = options.deferredCSSPath
    ? `<link rel="preload" href="${options.deferredCSSPath}${cssCacheBuster}" as="style">`
    : `<link rel="preload" href="/styles.css${cssCacheBuster}" as="style">`;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <!-- Early CSS preload for faster discovery -->
  ${cssPreload}
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${metaTags}
  <title>${seoConfig.title}</title>
  ${fontPreloadHints}
  ${inlineFontCSS}
  <!-- Critical CSS (inlined for fast first paint) -->
  ${inlineCriticalCSS}
  ${
    options.deferredCSSPath
      ? deferredCSSLoader
      : `<!-- Async full CSS loading -->
  <link rel="stylesheet" href="/styles.css${cssCacheBuster}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="/styles.css${cssCacheBuster}"></noscript>`
  }
  <!-- Modulepreload for faster script loading -->
  <link rel="modulepreload" href="${entrypoint}${cacheBuster}">
  ${criticalChunkPreloads}
  ${clientModulePreloads}
  ${jsonLd}
</head>
<body>
  <div id="root">${
    options.ssrContent
      ? options.ssrContent
      : '<div class="initial-loading">Loading...</div>'
  }</div>

  <!-- Chunk manifest for lazy loading -->
  ${manifestScript}
  ${
    options.rscPayload
      ? `<!-- RSC payload for hydration -->
  <script id="__RSC_PAYLOAD__" type="application/json">${
        options.rscPayload.replace(/<\/script/gi, "<\\/script")
      }</script>`
      : ""
  }

  <!-- Client entry point -->
  <script type="module" src="${entrypoint}${cacheBuster}"></script>
</body>
</html>`;
}
