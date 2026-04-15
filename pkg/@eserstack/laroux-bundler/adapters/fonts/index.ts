// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
// Font utilities for laroux.js build system

import type {
  FontDefinition,
  FontDisplay,
  FontStyle,
  FontWeight,
} from "../../types.ts";

// Re-export types for convenience
export type { FontDefinition, FontDisplay, FontStyle, FontWeight };

/**
 * Filter fonts by provider
 */
function getGoogleFonts(fonts: FontDefinition[]): FontDefinition[] {
  return fonts.filter((font) => font.provider === "google");
}

/**
 * Generate Google Fonts URL from configuration
 */
export function generateGoogleFontsUrl(fonts: FontDefinition[]): string {
  const googleFonts = getGoogleFonts(fonts);

  if (googleFonts.length === 0) {
    return "";
  }

  const families = googleFonts.map((font) => {
    let family = font.family.replace(/\s+/g, "+");

    // Add weights and styles
    if (font.weights && font.weights.length > 0) {
      const styles = font.styles ?? ["normal"];

      if (styles.includes("italic") && styles.includes("normal")) {
        // Both italic and normal: use ital,wght@0,400;0,700;1,400;1,700 format
        const combinations: string[] = [];
        for (const style of styles) {
          const italValue = style === "italic" ? "1" : "0";
          for (const weight of font.weights) {
            combinations.push(`${italValue},${weight}`);
          }
        }
        family += `:ital,wght@${combinations.join(";")}`;
      } else if (styles.includes("italic")) {
        // Only italic
        family += `:ital,wght@${font.weights.map((w) => `1,${w}`).join(";")}`;
      } else {
        // Only normal (most common)
        family += `:wght@${font.weights.join(";")}`;
      }
    }

    return family;
  });

  // Manually construct URL to avoid double-encoding special characters
  const familyParams = families.map((f) => `family=${f}`).join("&");
  const display = googleFonts[0]?.display ?? "swap";

  return `https://fonts.googleapis.com/css2?${familyParams}&display=${display}`;
}

/**
 * Generate CSS variables from font configuration
 */
export function generateFontVariables(fonts: FontDefinition[]): string {
  const variables = fonts
    .filter((font) => font.variable)
    .map((font) => {
      const fallbacks = font.fallback ? `, ${font.fallback.join(", ")}` : "";
      return `    ${font.variable}: "${font.family}"${fallbacks};`;
    })
    .join("\n");

  return `:root {\n${variables}\n  }`;
}

/**
 * Get all configured font families for optimization
 */
export function getFontFamilies(fonts: FontDefinition[]): string[] {
  return fonts.map((font) => font.family);
}

/**
 * Get font URLs for optimization (used by build system)
 */
export function getFontUrls(fonts: FontDefinition[]): string[] {
  const googleFonts = getGoogleFonts(fonts);

  if (googleFonts.length === 0) {
    return [];
  }

  // Generate a single URL with all Google fonts
  return [generateGoogleFontsUrl(fonts)];
}
