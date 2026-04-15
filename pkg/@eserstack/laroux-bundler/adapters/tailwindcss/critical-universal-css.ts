// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Critical Universal CSS Extraction
 *
 * Dynamically extracts essential base CSS from the compiled Tailwind CSS.
 * This ensures critical CSS uses actual values from the app's global.css
 * and theme configuration, not hardcoded values.
 *
 * Architecture:
 * 1. Parse compiled CSS to find @layer base and @layer theme blocks
 * 2. Extract specific selectors needed for initial render (html, body, #root)
 * 3. Extract CSS variables from theme for fallbacks
 * 4. Output as minimal CSS for fast initial paint
 *
 * IMPORTANT: Does NOT extract element resets (a, button, h1-h6) because
 * unlayered CSS overrides Tailwind's @layer utilities, breaking classes
 * like .text-white, .bg-primary-600, etc.
 */

import * as logging from "@eserstack/logging";

const criticalUniversalCssLogger = logging.logger.getLogger([
  "laroux-bundler",
  "critical-universal-css",
]);

/**
 * Result of critical universal CSS extraction
 */
export type CriticalUniversalCssResult = {
  /** The generated critical universal CSS */
  css: string;
  /** CSS variables extracted from theme */
  themeVariables: Record<string, string>;
  /** Statistics about extraction */
  stats: {
    /** Number of CSS variables extracted */
    variableCount: number;
    /** Number of rules extracted */
    rulesExtracted: number;
    /** Total size in bytes */
    size: number;
  };
};

/**
 * Selectors to extract from @layer base for critical CSS.
 * These are essential for initial render and don't conflict with utilities.
 */
const CRITICAL_SELECTORS = [
  "html",
  ":host",
  "html, :host",
  "body",
  "#root",
  ".initial-loading",
  "[data-client-component]",
];

/**
 * Selectors to EXCLUDE - these conflict with Tailwind utilities when unlayered
 */
const EXCLUDED_SELECTORS = [
  "*",
  "*, ::after, ::before",
  "*, ::after, ::before, ::backdrop, ::file-selector-button",
  "a",
  "button",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "h1, h2, h3, h4, h5, h6",
];

/**
 * Extract a @layer block from CSS
 */
function extractLayerBlock(css: string, layerName: string): string | null {
  const pattern = new RegExp(`@layer\\s+${layerName}\\s*\\{`, "g");
  const match = pattern.exec(css);

  if (!match) {
    return null;
  }

  const startIndex = match.index + match[0].length;
  let braceCount = 1;
  let pos = startIndex;

  while (pos < css.length && braceCount > 0) {
    if (css[pos] === "{") braceCount++;
    else if (css[pos] === "}") braceCount--;
    pos++;
  }

  return css.slice(startIndex, pos - 1).trim();
}

/**
 * Parse CSS rules from a block of CSS text.
 * Returns array of { selector, declarations } objects.
 */
function parseCssRules(
  cssBlock: string,
): Array<{ selector: string; declarations: string }> {
  const rules: Array<{ selector: string; declarations: string }> = [];

  // Match selector { declarations }
  // This is a simplified parser that handles most cases
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;

  while ((match = rulePattern.exec(cssBlock)) !== null) {
    const selectorRaw = match[1];
    const declarationsRaw = match[2];
    if (selectorRaw === undefined || declarationsRaw === undefined) continue;

    const selector = selectorRaw.trim();
    const declarations = declarationsRaw.trim();

    if (selector && declarations) {
      rules.push({ selector, declarations });
    }
  }

  return rules;
}

/**
 * Check if a selector should be included in critical CSS
 */
function shouldIncludeSelector(selector: string): boolean {
  // Check if selector is in the excluded list
  const normalizedSelector = selector.trim().toLowerCase();

  for (const excluded of EXCLUDED_SELECTORS) {
    if (normalizedSelector === excluded.toLowerCase()) {
      return false;
    }
    // Also check if selector starts with excluded element selectors
    if (
      normalizedSelector.startsWith("a ") ||
      normalizedSelector.startsWith("a,") ||
      normalizedSelector.startsWith("button ") ||
      normalizedSelector.startsWith("button,")
    ) {
      return false;
    }
  }

  // Check if selector is in the critical list
  for (const critical of CRITICAL_SELECTORS) {
    if (normalizedSelector === critical.toLowerCase()) {
      return true;
    }
    // Handle comma-separated selectors like "html, :host"
    const selectorParts = normalizedSelector.split(",").map((s) => s.trim());
    const criticalParts = critical.toLowerCase().split(",").map((s) =>
      s.trim()
    );

    if (
      selectorParts.some((sp) => criticalParts.includes(sp)) ||
      criticalParts.some((cp) => selectorParts.includes(cp))
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract CSS variables from theme layer
 */
function extractThemeVariables(themeBlock: string): Record<string, string> {
  const variables: Record<string, string> = {};

  // Match CSS variable declarations
  const varPattern = /(--[\w-]+):\s*([^;]+);/g;
  let match;

  while ((match = varPattern.exec(themeBlock)) !== null) {
    const [, name, value] = match;
    if (name && value) {
      variables[name] = value.trim();
    }
  }

  return variables;
}

/**
 * Extract critical universal CSS from compiled Tailwind CSS output.
 *
 * This function:
 * 1. Extracts @layer theme to get CSS variables
 * 2. Extracts @layer base rules for critical selectors (html, body, #root, etc.)
 * 3. Combines them into minimal critical CSS
 *
 * @param compiledCss - The full compiled CSS (styles.css)
 * @returns Critical universal CSS result with extracted values
 */
export function extractCriticalUniversalCss(
  compiledCss: string,
): CriticalUniversalCssResult {
  criticalUniversalCssLogger.debug(
    "Extracting critical universal CSS from compiled output...",
  );

  const cssLines: string[] = [];
  let rulesExtracted = 0;

  // Extract theme layer for CSS variables
  const themeBlock = extractLayerBlock(compiledCss, "theme");
  const themeVariables = themeBlock ? extractThemeVariables(themeBlock) : {};

  // Add minimal universal reset that doesn't conflict with utilities
  // Only box-sizing is safe - padding/margin/border conflict with utility classes
  cssLines.push("*,*::before,*::after{box-sizing:border-box}");
  rulesExtracted++;

  // Extract base layer
  const baseBlock = extractLayerBlock(compiledCss, "base");

  if (baseBlock) {
    // There may be multiple @layer base blocks, find all of them
    const allBaseBlocks: string[] = [baseBlock];

    // Look for additional @layer base blocks (app-specific ones come later)
    let searchStart = compiledCss.indexOf(baseBlock) + baseBlock.length;
    while (searchStart < compiledCss.length) {
      const nextBase = extractLayerBlock(
        compiledCss.slice(searchStart),
        "base",
      );
      if (nextBase) {
        allBaseBlocks.push(nextBase);
        searchStart += compiledCss.slice(searchStart).indexOf(nextBase) +
          nextBase.length;
      } else {
        break;
      }
    }

    // Parse and filter rules from all base blocks
    for (const block of allBaseBlocks) {
      const rules = parseCssRules(block);

      for (const rule of rules) {
        if (shouldIncludeSelector(rule.selector)) {
          // Clean up the declarations (remove extra whitespace)
          const cleanDeclarations = rule.declarations
            .replace(/\s+/g, " ")
            .replace(/;\s*/g, ";")
            .replace(/:\s*/g, ":")
            .trim();

          if (cleanDeclarations) {
            cssLines.push(`${rule.selector}{${cleanDeclarations}}`);
            rulesExtracted++;
          }
        }
      }
    }
  }

  const css = cssLines.join("\n");

  const stats = {
    variableCount: Object.keys(themeVariables).length,
    rulesExtracted,
    size: new TextEncoder().encode(css).length,
  };

  criticalUniversalCssLogger.debug(
    `Extracted critical universal CSS: ${stats.size} bytes, ${stats.rulesExtracted} rules, ${stats.variableCount} theme variables`,
  );

  return { css, themeVariables, stats };
}

/**
 * Generate the critical universal CSS from compiled CSS.
 *
 * @param compiledCss - The full compiled CSS
 * @returns Minified CSS string ready for inline embedding
 */
export function generateCriticalUniversalCss(compiledCss: string): string {
  const result = extractCriticalUniversalCss(compiledCss);

  // Minify by removing unnecessary whitespace
  return result.css
    .replace(/\n+/g, "")
    .replace(/\s*{\s*/g, "{")
    .replace(/\s*}\s*/g, "}")
    .replace(/\s*;\s*/g, ";")
    .replace(/\s*:\s*/g, ":")
    .replace(/;\}/g, "}");
}

/**
 * Extract only the @layer theme block from compiled CSS.
 *
 * @param compiledCss - The full compiled CSS
 * @returns The @layer theme block content or null if not found
 */
export function extractThemeLayer(compiledCss: string): string | null {
  return extractLayerBlock(compiledCss, "theme");
}

/**
 * Default critical universal CSS for when no compiled CSS is available yet.
 * Used during initial page loads before the build completes.
 * This is minimal and safe - scrollbar-gutter prevents layout shift,
 * box-sizing is universal best practice.
 */
export const DEFAULT_CRITICAL_UNIVERSAL_CSS =
  "html{scrollbar-gutter:stable}*,*::before,*::after{box-sizing:border-box}";
