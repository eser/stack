// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Pure functions for navigation analysis and link configuration
 *
 * @module
 */

import type { LinkConfig, ModifierKeys, NavigationAnalysis } from "./types.ts";

/**
 * Analyze whether a navigation should be handled by the router
 *
 * @param href - The target URL
 * @param modifiers - Modifier key state from the click event
 * @returns Analysis result indicating if router should handle navigation
 */
export function analyzeNavigation(
  href: string,
  modifiers: ModifierKeys,
): NavigationAnalysis {
  // Modifier keys = let browser handle (new tab, etc.)
  if (
    modifiers.metaKey ||
    modifiers.ctrlKey ||
    modifiers.shiftKey ||
    modifiers.altKey
  ) {
    return { shouldHandle: false, reason: "modifier-key" };
  }

  // External links
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return { shouldHandle: false, reason: "external" };
  }

  // mailto links
  if (href.startsWith("mailto:")) {
    return { shouldHandle: false, reason: "mailto" };
  }

  // tel links
  if (href.startsWith("tel:")) {
    return { shouldHandle: false, reason: "tel" };
  }

  // Hash-only links
  if (href.startsWith("#")) {
    return { shouldHandle: false, reason: "hash" };
  }

  return { shouldHandle: true };
}

/**
 * Build a normalized link configuration with defaults
 *
 * @param config - Partial configuration with required href
 * @returns Complete link configuration with defaults applied
 */
export function buildLinkConfig(
  config: Partial<LinkConfig> & { href: string },
): LinkConfig {
  return {
    href: config.href,
    replace: config.replace ?? false,
    scroll: config.scroll ?? true,
    prefetch: config.prefetch ?? false,
  };
}

/**
 * Check if a URL is external (absolute HTTP/HTTPS)
 *
 * @param href - URL to check
 * @returns True if the URL is external
 */
export function isExternalUrl(href: string): boolean {
  return href.startsWith("http://") || href.startsWith("https://");
}

/**
 * Check if a URL is a special protocol (mailto, tel)
 *
 * @param href - URL to check
 * @returns True if the URL uses a special protocol
 */
export function isSpecialProtocol(href: string): boolean {
  return href.startsWith("mailto:") || href.startsWith("tel:");
}
