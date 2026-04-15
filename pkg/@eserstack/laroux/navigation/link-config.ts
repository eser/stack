// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Pure functions for navigation analysis and link configuration
 *
 * @module
 */

import type { LinkConfig, ModifierKeys, NavigationAnalysis } from "./types.ts";

/**
 * Get the protocol from a URL string, returning empty string for relative URLs.
 */
function getUrlProtocol(href: string): string {
  // Hash-only and relative URLs don't have protocols
  if (href.startsWith("#") || href.startsWith("/") || href.startsWith(".")) {
    return "";
  }

  // Use URL API to parse absolute URLs
  if (URL.canParse(href)) {
    return new URL(href).protocol;
  }

  // Fallback for protocol-like strings (mailto:, tel:, etc.)
  const colonIndex = href.indexOf(":");
  if (colonIndex > 0 && colonIndex < 10) {
    return href.slice(0, colonIndex + 1);
  }

  return "";
}

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

  // Hash-only links
  if (href.startsWith("#")) {
    return { shouldHandle: false, reason: "hash" };
  }

  // Check protocol for non-relative URLs
  const protocol = getUrlProtocol(href);

  // External links (HTTP/HTTPS)
  if (protocol === "http:" || protocol === "https:") {
    return { shouldHandle: false, reason: "external" };
  }

  // mailto links
  if (protocol === "mailto:") {
    return { shouldHandle: false, reason: "mailto" };
  }

  // tel links
  if (protocol === "tel:") {
    return { shouldHandle: false, reason: "tel" };
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
  const protocol = getUrlProtocol(href);
  return protocol === "http:" || protocol === "https:";
}

/**
 * Check if a URL is a special protocol (mailto, tel)
 *
 * @param href - URL to check
 * @returns True if the URL uses a special protocol
 */
export function isSpecialProtocol(href: string): boolean {
  const protocol = getUrlProtocol(href);
  return protocol === "mailto:" || protocol === "tel:";
}
