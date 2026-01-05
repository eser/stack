// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Critical Page CSS Extraction for Tailwind CSS v4
 *
 * Extracts page-specific above-the-fold CSS while properly handling Tailwind's @layer system:
 * - @layer theme: ALWAYS critical (contains CSS variables)
 * - @layer base: ALWAYS critical (reset/preflight styles)
 * - @layer utilities: Split based on selector usage in HTML
 *
 * @see https://tailwindcss.com/docs/functions-and-directives#layer
 */

import * as logging from "@eser/logging";
import { ABOVE_FOLD_PATTERNS, CRITICAL_LAYERS } from "./critical-css-config.ts";

const criticalPageCssLogger = logging.logger.getLogger([
  "laroux-bundler",
  "critical-page-css",
]);

/**
 * Critical page CSS extraction options
 */
export type CriticalPageCssOptions = {
  /** HTML content to analyze */
  html: string;
  /** CSS content to split */
  css: string;
  /** Whether to minify output (disabled for Tailwind v4 due to CSS nesting) */
  minify?: boolean;
  /** Selectors to always include in critical CSS */
  forceInclude?: (string | RegExp)[];
  /** Selectors to always exclude from critical CSS */
  forceExclude?: (string | RegExp)[];
};

/**
 * Result of critical page CSS extraction
 */
export type CriticalPageCssResult = {
  /** Critical CSS to inline in <head> */
  critical: string;
  /** Deferred CSS to load asynchronously */
  deferred: string;
  /** Statistics about extraction */
  stats: {
    /** Original CSS size in bytes */
    originalSize: number;
    /** Critical CSS size in bytes */
    criticalSize: number;
    /** Deferred CSS size in bytes */
    deferredSize: number;
    /** Number of critical rules */
    criticalRules: number;
    /** Number of deferred rules */
    deferredRules: number;
  };
};

/**
 * Extract a @layer block starting from a specific position
 */
function extractLayerBlockAt(
  css: string,
  startIndex: number,
): { innerContent: string; end: number } | null {
  // Find opening brace
  let pos = startIndex;
  while (pos < css.length && css[pos] !== "{") pos++;
  if (pos >= css.length) return null;

  const contentStart = pos + 1;
  let braceCount = 1;
  pos++; // Skip opening brace

  // Find matching closing brace
  while (pos < css.length && braceCount > 0) {
    if (css[pos] === "{") braceCount++;
    else if (css[pos] === "}") braceCount--;
    pos++;
  }

  // Extract inner content (without the @layer wrapper)
  const innerContent = css.slice(contentStart, pos - 1).trim();

  return { innerContent, end: pos };
}

/**
 * Extract all @layer blocks from CSS
 * Handles multiple blocks with the same layer name by combining their content
 */
function extractAllLayers(
  css: string,
): Map<string, { block: string; start: number; end: number }> {
  const layers = new Map<
    string,
    { block: string; start: number; end: number }
  >();

  // Track all inner contents for each layer name (to handle duplicates)
  const layerContents = new Map<string, string[]>();
  const layerPositions = new Map<
    string,
    { start: number; end: number }
  >();

  // Match @layer declarations (both @layer name; and @layer name { ... })
  const layerPattern = /@layer\s+([a-zA-Z_-][a-zA-Z0-9_-]*)\s*[{;]/g;
  let match: RegExpExecArray | null;

  while ((match = layerPattern.exec(css)) !== null) {
    const layerName = match[1];
    if (layerName === undefined) continue;

    // Check if it's a declaration (@layer name;) or block (@layer name { ... })
    if (match[0].endsWith(";")) {
      // Layer declaration only - not a block
      continue;
    }

    const extracted = extractLayerBlockAt(
      css,
      match.index + match[0].length - 1,
    );
    if (extracted) {
      // Accumulate content for this layer
      if (!layerContents.has(layerName)) {
        layerContents.set(layerName, []);
        layerPositions.set(layerName, {
          start: match.index,
          end: extracted.end,
        });
      }
      layerContents.get(layerName)!.push(extracted.innerContent);
      // Update end position to the last block
      layerPositions.get(layerName)!.end = extracted.end;
    }
  }

  // Build combined blocks
  for (const [layerName, contents] of layerContents) {
    const combinedContent = contents.join("\n");
    const positions = layerPositions.get(layerName)!;
    layers.set(layerName, {
      block: `@layer ${layerName} {\n${combinedContent}\n}`,
      start: positions.start,
      end: positions.end,
    });
  }

  return layers;
}

/**
 * Parse CSS rules from a string (for utility layer splitting)
 * Handles Tailwind v4's nested @media syntax inside selectors
 */
function parseUtilityRules(
  css: string,
): Array<{ selector: string; full: string }> {
  const rules: Array<{ selector: string; full: string }> = [];

  // Use brace-matching to extract complete rules with nested content
  let pos = 0;
  while (pos < css.length) {
    // Skip whitespace
    while (pos < css.length && /\s/.test(css[pos]!)) pos++;
    if (pos >= css.length) break;

    // Find selector start
    const selectorStart = pos;

    // Find opening brace
    while (pos < css.length && css[pos] !== "{") pos++;
    if (pos >= css.length) break;

    const selector = css.slice(selectorStart, pos).trim();
    if (!selector) {
      pos++;
      continue;
    }

    // Match braces to find complete block (handles nested @media)
    let braceCount = 1;
    pos++; // Skip opening brace

    while (pos < css.length && braceCount > 0) {
      if (css[pos] === "{") braceCount++;
      else if (css[pos] === "}") braceCount--;
      pos++;
    }

    const fullRule = css.slice(selectorStart, pos);

    // Top-level @media blocks (not nested in selectors)
    if (selector.startsWith("@media") || selector.startsWith("@supports")) {
      rules.push({ selector: "@media", full: fullRule });
    } else if (selector && !selector.startsWith("@")) {
      rules.push({
        selector,
        full: fullRule,
      });
    }
  }

  return rules;
}

/**
 * Check if a selector is used in HTML
 */
function selectorMatchesHtml(selector: string, html: string): boolean {
  // Extract class names from selector
  const classMatches = selector.match(/\.([a-zA-Z_-][a-zA-Z0-9_\-\\:/.[\]]*)/g);
  if (classMatches) {
    for (const classMatch of classMatches) {
      // Clean up escaped characters and get class name
      let className = classMatch.substring(1); // Remove leading dot
      className = className.replace(/\\/g, ""); // Remove escapes
      className = className.split(":")[0] ?? ""; // Remove pseudo-classes

      // Check if class is in HTML
      if (
        className &&
        new RegExp(`class=["'][^"']*\\b${escapeRegex(className)}\\b`, "i").test(
          html,
        )
      ) {
        return true;
      }
    }
  }

  // Extract element selectors
  const elementMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
  if (elementMatch && elementMatch[1]) {
    const element = elementMatch[1].toLowerCase();
    if (new RegExp(`<${element}[\\s>]`, "i").test(html)) {
      return true;
    }
  }

  // Extract ID selectors
  const idMatches = selector.match(/#([a-zA-Z_-][a-zA-Z0-9_-]*)/g);
  if (idMatches) {
    for (const idMatch of idMatches) {
      const id = idMatch.substring(1);
      if (new RegExp(`id=["']${id}["']`, "i").test(html)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check if selector matches force patterns
 */
function matchesForcePatterns(
  selector: string,
  patterns: (string | RegExp)[],
): boolean {
  return patterns.some((pattern) => {
    if (typeof pattern === "string") {
      return selector.includes(pattern);
    }
    return pattern.test(selector);
  });
}

/**
 * Check if a utility selector is likely above-the-fold
 */
function isLikelyAboveFold(selector: string): boolean {
  return ABOVE_FOLD_PATTERNS.some((pattern) => pattern.test(selector));
}

/**
 * Extract critical page CSS from full CSS based on HTML content
 *
 * Strategy:
 * 1. Always include @layer theme (CSS variables)
 * 2. Always include @layer base (reset/preflight)
 * 3. Split @layer utilities based on selector usage and above-fold heuristics
 * 4. Include @font-face and used @keyframes
 */
export function extractCriticalPageCss(
  options: CriticalPageCssOptions,
): CriticalPageCssResult {
  const {
    html,
    css,
    forceInclude = [],
    forceExclude = [],
  } = options;

  criticalPageCssLogger.debug(
    "Extracting critical page CSS (Tailwind v4 aware)...",
  );

  const criticalParts: string[] = [];
  const deferredParts: string[] = [];
  let criticalRuleCount = 0;
  let deferredRuleCount = 0;

  // Preserve the Tailwind comment header
  const headerMatch = css.match(/^\/\*![\s\S]*?\*\//);
  if (headerMatch) {
    criticalParts.push(headerMatch[0]);
  }

  // Extract @layer order declaration (must be first)
  const layerOrderMatch = css.match(/@layer\s+[a-zA-Z_,-\s]+;/);
  if (layerOrderMatch) {
    criticalParts.push(layerOrderMatch[0]);
  }

  // Extract @property rules (CSS Houdini - needed for gradients, transforms, etc.)
  // These MUST be in critical CSS for gradient text and other effects to work
  const propertyRegex = /@property\s+--[\w-]+\s*\{[^}]*\}/g;
  const propertyRules = css.match(propertyRegex) ?? [];
  if (propertyRules.length > 0) {
    criticalParts.push(propertyRules.join("\n"));
    criticalRuleCount += propertyRules.length;
    criticalPageCssLogger.debug(
      `  @property rules: ${propertyRules.length} (CRITICAL)`,
    );
  }

  // Extract all layer blocks
  const layers = extractAllLayers(css);

  // Process each layer
  for (const [layerName, layerData] of layers) {
    if (CRITICAL_LAYERS.includes(layerName)) {
      // Theme, base, properties - ALWAYS critical
      criticalParts.push(layerData.block);
      criticalRuleCount++;
      criticalPageCssLogger.debug(`  @layer ${layerName}: CRITICAL (required)`);
    } else if (layerName === "utilities") {
      // Split utilities based on usage
      const { critical: criticalUtils, deferred: deferredUtils } =
        splitUtilityLayer(layerData.block, html, forceInclude, forceExclude);

      if (criticalUtils.trim()) {
        criticalParts.push(`@layer utilities {\n${criticalUtils}\n}`);
        criticalRuleCount += criticalUtils.split("}").length - 1;
      }
      if (deferredUtils.trim()) {
        deferredParts.push(`@layer utilities {\n${deferredUtils}\n}`);
        deferredRuleCount += deferredUtils.split("}").length - 1;
      }
      criticalPageCssLogger.debug(`  @layer utilities: split`);
    } else if (layerName === "components") {
      // Components - include if selectors match HTML
      const { critical: criticalComps, deferred: deferredComps } =
        splitUtilityLayer(layerData.block, html, forceInclude, forceExclude);

      if (criticalComps.trim()) {
        criticalParts.push(`@layer components {\n${criticalComps}\n}`);
        criticalRuleCount++;
      }
      if (deferredComps.trim()) {
        deferredParts.push(`@layer components {\n${deferredComps}\n}`);
        deferredRuleCount++;
      }
    } else {
      // Unknown layers - defer
      deferredParts.push(layerData.block);
      deferredRuleCount++;
    }
  }

  // Handle @font-face (always critical)
  const fontFaceRegex = /@font-face\s*\{[^}]*\}/gi;
  const fontFaces = css.match(fontFaceRegex) ?? [];
  for (const fontFace of fontFaces) {
    criticalParts.push(fontFace);
    criticalRuleCount++;
  }

  // Handle @keyframes (critical if animation name is used in HTML)
  const keyframeRegex =
    /@keyframes\s+([^\s{]+)\s*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/gi;
  let keyframeMatch: RegExpExecArray | null;
  while ((keyframeMatch = keyframeRegex.exec(css)) !== null) {
    const animationName = keyframeMatch[1];
    if (animationName && html.includes(animationName)) {
      criticalParts.push(keyframeMatch[0]);
      criticalRuleCount++;
    } else {
      deferredParts.push(keyframeMatch[0]);
      deferredRuleCount++;
    }
  }

  // Build output
  const critical = criticalParts.join("\n\n");
  const deferred = deferredParts.join("\n\n");

  const stats = {
    originalSize: new TextEncoder().encode(css).length,
    criticalSize: new TextEncoder().encode(critical).length,
    deferredSize: new TextEncoder().encode(deferred).length,
    criticalRules: criticalRuleCount,
    deferredRules: deferredRuleCount,
  };

  criticalPageCssLogger.debug(
    `Critical: ${stats.criticalSize} bytes (${criticalRuleCount} parts), ` +
      `Deferred: ${stats.deferredSize} bytes (${deferredRuleCount} parts)`,
  );

  return { critical, deferred, stats };
}

/**
 * Split utility layer content into critical and deferred
 */
function splitUtilityLayer(
  layerContent: string,
  html: string,
  forceInclude: (string | RegExp)[],
  forceExclude: (string | RegExp)[],
): { critical: string; deferred: string } {
  // Remove @layer wrapper to get inner content
  const innerContent = layerContent
    .replace(/^@layer\s+\w+\s*\{/, "")
    .replace(/\}$/, "")
    .trim();

  const rules = parseUtilityRules(innerContent);
  const criticalRules: string[] = [];
  const deferredRules: string[] = [];

  for (const rule of rules) {
    // Media queries - check if inner selectors are critical
    if (rule.selector === "@media") {
      // For now, include all responsive utilities in critical
      // (they affect layout and prevent CLS)
      if (
        rule.full.includes("@media") &&
        (rule.full.includes("min-width") || rule.full.includes("max-width"))
      ) {
        criticalRules.push(rule.full);
      } else {
        deferredRules.push(rule.full);
      }
      continue;
    }

    // Force exclude check
    if (matchesForcePatterns(rule.selector, forceExclude)) {
      deferredRules.push(rule.full);
      continue;
    }

    // Force include check
    if (matchesForcePatterns(rule.selector, forceInclude)) {
      criticalRules.push(rule.full);
      continue;
    }

    // Check if selector is in HTML and likely above-fold
    const inHtml = selectorMatchesHtml(rule.selector, html);
    const aboveFold = isLikelyAboveFold(rule.selector);

    if (inHtml || aboveFold) {
      criticalRules.push(rule.full);
    } else {
      deferredRules.push(rule.full);
    }
  }

  return {
    critical: criticalRules.join("\n"),
    deferred: deferredRules.join("\n"),
  };
}

/**
 * Generate inline critical CSS script for async loading
 */
export function generateAsyncCssLoader(deferredCssPath: string): string {
  return `<script>
(function(){
  var l=document.createElement('link');
  l.rel='stylesheet';
  l.href='${deferredCssPath}';
  l.media='print';
  l.onload=function(){this.media='all'};
  document.head.appendChild(l);
})();
</script>
<noscript><link rel="stylesheet" href="${deferredCssPath}"></noscript>`;
}
