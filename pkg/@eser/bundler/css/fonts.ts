// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Google Fonts optimizer for self-hosting.
 *
 * Provides utilities for:
 * - Downloading Google Fonts for self-hosting
 * - Rewriting @font-face declarations
 * - Generating preload hints for performance
 *
 * @module
 */

import * as posix from "@std/path/posix";
import * as fs from "@std/fs";
import type {
  FontFile,
  FontOptimizationOptions,
  FontOptimizationResult,
} from "./types.ts";

/**
 * Modern browser User-Agent for fetching woff2 format.
 */
const MODERN_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Download a font file from URL and save it locally.
 *
 * @param url - Font file URL
 * @param outputDir - Directory to save font file
 * @returns Font file information
 */
export async function downloadFont(
  url: string,
  outputDir: string,
): Promise<FontFile> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download font from ${url}: ${response.status}`);
  }

  // Extract filename from URL
  const urlParts = url.split("/");
  const urlFilename = urlParts[urlParts.length - 1] ?? "font.woff2";

  // Clean filename and ensure it has extension
  const filename = urlFilename.includes(".")
    ? urlFilename
    : `${urlFilename}.woff2`;

  const localPath = posix.join(outputDir, filename);

  // Download and save font file
  const fontData = await response.arrayBuffer();
  await fs.ensureDir(outputDir);
  await Deno.writeFile(localPath, new Uint8Array(fontData));

  // Determine format from extension
  const format = filename.endsWith(".woff2")
    ? "woff2"
    : filename.endsWith(".woff")
    ? "woff"
    : "truetype";

  return {
    url,
    localPath,
    filename,
    format,
  };
}

/**
 * Download multiple fonts in parallel.
 *
 * @param urls - Array of font URLs
 * @param outputDir - Directory to save font files
 * @returns Array of font file information
 */
export async function downloadFonts(
  urls: readonly string[],
  outputDir: string,
): Promise<FontFile[]> {
  return await Promise.all(urls.map((url) => downloadFont(url, outputDir)));
}

/**
 * Extract font URLs from Google Fonts CSS.
 *
 * Parses @font-face declarations and extracts url() references.
 *
 * @param fontCss - Google Fonts CSS content
 * @returns Array of font file URLs
 */
export function extractFontUrls(fontCss: string): string[] {
  const urls: string[] = [];

  // Match url(...) patterns in CSS
  // Handles: url(https://...) and url('https://...') and url("https://...")
  const urlPattern = /url\((["']?)([^"')]+)\1\)/g;

  let match;
  while ((match = urlPattern.exec(fontCss)) !== null) {
    const url = match[2];

    // Only include actual font files (.woff2, .woff, .ttf)
    if (
      url !== undefined &&
      (url.includes(".woff2") || url.includes(".woff") || url.includes(".ttf"))
    ) {
      urls.push(url);
    }
  }

  return urls;
}

/**
 * Fetch Google Fonts CSS with proper User-Agent to get woff2 files.
 *
 * @param fontUrl - Google Fonts URL
 * @returns CSS content with @font-face declarations
 */
export async function fetchGoogleFontsCss(fontUrl: string): Promise<string> {
  const response = await fetch(fontUrl, {
    headers: {
      "User-Agent": MODERN_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Fonts CSS: ${response.status} ${response.statusText}`,
    );
  }

  return await response.text();
}

/**
 * Rewrite @font-face declarations to use local font files.
 *
 * @param originalCss - Original Google Fonts CSS
 * @param fontFiles - Downloaded font files
 * @param publicPath - Public path for font URLs
 * @returns Rewritten CSS with local paths
 */
export function rewriteFontFaceCss(
  originalCss: string,
  fontFiles: readonly FontFile[],
  publicPath: string,
): string {
  let rewrittenCss = originalCss;

  for (const fontFile of fontFiles) {
    // Replace CDN URLs with local paths
    const localUrl = `${publicPath}/${fontFile.filename}`;
    rewrittenCss = rewrittenCss.replace(fontFile.url, localUrl);
  }

  return rewrittenCss;
}

/**
 * Generate preload hints for font files.
 *
 * Preloading critical fonts improves FCP and LCP metrics.
 *
 * @param fontFiles - Font files to generate hints for
 * @param publicPath - Public path for font URLs
 * @returns Array of HTML preload link tags
 */
export function generatePreloadHints(
  fontFiles: readonly FontFile[],
  publicPath: string,
): string[] {
  return fontFiles.map((fontFile) => {
    const localUrl = `${publicPath}/${fontFile.filename}`;
    return `<link rel="preload" href="${localUrl}" as="font" type="font/${fontFile.format}" crossorigin="anonymous" />`;
  });
}

/**
 * Parse Google Fonts family names from URL.
 *
 * @param fontUrl - Google Fonts URL
 * @returns Array of font family names
 *
 * @example
 * ```ts
 * extractFontFamilies("https://fonts.googleapis.com/css2?family=Roboto:wght@400;500")
 * // Returns: ["Roboto"]
 * ```
 */
export function extractFontFamilies(fontUrl: string): string[] {
  const familyMatch = fontUrl.match(/family=([^&]+)/);
  if (familyMatch === null) return [];

  const familiesParam = familyMatch[1];
  if (familiesParam === undefined) return [];

  // Split by | for multiple families, extract name before ':'
  return familiesParam.split("|").map((family) => {
    const name = family.split(":")[0] ?? family;
    // Decode URL encoding (e.g., Roboto+Mono → Roboto Mono)
    return decodeURIComponent(name.replace(/\+/g, " "));
  });
}

/**
 * Optimize Google Fonts for self-hosting.
 *
 * Downloads fonts, rewrites CSS, and generates preload hints.
 *
 * @param fontUrl - Google Fonts URL
 * @param options - Optimization options
 * @returns Font optimization result
 *
 * @example
 * ```ts
 * const result = await optimizeGoogleFonts(
 *   "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500",
 *   {
 *     outputDir: "dist/fonts",
 *     publicPath: "/fonts",
 *   },
 * );
 *
 * console.log(result.fontFaceCSS);  // Rewritten @font-face CSS
 * console.log(result.preloadHints); // HTML preload tags
 * ```
 */
export async function optimizeGoogleFonts(
  fontUrl: string,
  options: FontOptimizationOptions,
): Promise<FontOptimizationResult> {
  const { outputDir, publicPath = "/fonts", maxPreloadFonts = 2 } = options;

  // Step 1: Fetch Google Fonts CSS
  const originalCss = await fetchGoogleFontsCss(fontUrl);

  // Step 2: Extract font file URLs from CSS
  const fontUrls = extractFontUrls(originalCss);

  if (fontUrls.length === 0) {
    return {
      fontFaceCSS: originalCss,
      preloadHints: [],
      files: [],
      totalSize: 0,
    };
  }

  // Step 3: Download all font files
  const fontFiles = await downloadFonts(fontUrls, outputDir);

  // Calculate total size
  let totalSize = 0;
  for (const file of fontFiles) {
    try {
      const stat = await Deno.stat(file.localPath);
      totalSize += stat.size;
    } catch {
      // Ignore stat errors
    }
  }

  // Step 4: Rewrite @font-face declarations with local paths
  const fontFaceCSS = rewriteFontFaceCss(originalCss, fontFiles, publicPath);

  // Step 5: Generate preload hints for critical fonts
  const criticalFonts = fontFiles.slice(
    0,
    Math.min(maxPreloadFonts, fontFiles.length),
  );
  const preloadHints = generatePreloadHints(criticalFonts, publicPath);

  return {
    fontFaceCSS,
    preloadHints,
    files: fontFiles,
    totalSize,
  };
}

/**
 * Optimize multiple Google Fonts URLs.
 *
 * @param fontUrls - Array of Google Fonts URLs
 * @param options - Optimization options
 * @returns Combined font optimization result
 */
export async function optimizeMultipleGoogleFonts(
  fontUrls: readonly string[],
  options: FontOptimizationOptions,
): Promise<FontOptimizationResult> {
  const results = await Promise.all(
    fontUrls.map((url) => optimizeGoogleFonts(url, options)),
  );

  // Combine results
  return {
    fontFaceCSS: results.map((r) => r.fontFaceCSS).join("\n\n"),
    preloadHints: results.flatMap((r) => r.preloadHints),
    files: results.flatMap((r) => r.files),
    totalSize: results.reduce((sum, r) => sum + r.totalSize, 0),
  };
}

/**
 * Generate inline font-face CSS for embedding.
 *
 * Useful for critical CSS inlining.
 *
 * @param fontFiles - Downloaded font files
 * @param publicPath - Public path for font URLs
 * @param families - Font family names for the @font-face declarations
 * @returns Inline @font-face CSS
 */
export function generateInlineFontFaceCss(
  fontFiles: readonly FontFile[],
  publicPath: string,
  families: readonly string[],
): string {
  const declarations: string[] = [];

  for (const file of fontFiles) {
    const familyName = families[0] ?? "sans-serif";
    const localUrl = `${publicPath}/${file.filename}`;

    declarations.push(`@font-face {
  font-family: '${familyName}';
  src: url('${localUrl}') format('${file.format}');
  font-display: swap;
}`);
  }

  return declarations.join("\n\n");
}
