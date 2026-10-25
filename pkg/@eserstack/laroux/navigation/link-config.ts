// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Pure functions for navigation analysis and link configuration
 *
 * @module
 */

import type { LinkConfig, ModifierKeys, NavigationAnalysis } from "./types.ts";

// A URL scheme as the URL parser reads it (RFC 3986, section 3.1): a letter,
// then letters, digits, "+", "-" or ".", ending in ":".
const SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

// "//host/path" keeps the page's scheme and points at another host. Browsers
// read "\" as "/" in http(s) URLs, so "\\host" and "/\host" mean the same.
const PROTOCOL_RELATIVE_PATTERN = /^[/\\]{2}/;

/**
 * Get the scheme of a URL, lowercased with its colon ("https:"), or "" for a
 * relative URL. The scheme is read from the text, so it is found even in a URL
 * that does not parse ("https://").
 */
function getUrlProtocol(href: string): string {
  const match = SCHEME_PATTERN.exec(href);
  return match === null ? "" : match[0].toLowerCase();
}

/**
 * Check whether a URL is protocol-relative ("//cdn.example.com/app.js").
 */
function isProtocolRelative(href: string): boolean {
  return PROTOCOL_RELATIVE_PATTERN.test(href);
}

/**
 * Analyze whether a navigation should be handled by the router
 *
 * The router handles relative URLs only. A modifier key, a hash-only link and
 * every URL that names a scheme or another host are left to the browser:
 * `mailto:` and `tel:` with their own reason, everything else (`http:`,
 * `https:`, protocol-relative, `ftp:`, `javascript:`, `data:` and so on) as
 * `"external"`, since the router cannot render a page outside the site.
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

  const protocol = getUrlProtocol(href);

  if (protocol === "mailto:") {
    return { shouldHandle: false, reason: "mailto" };
  }

  if (protocol === "tel:") {
    return { shouldHandle: false, reason: "tel" };
  }

  if (protocol !== "" || isProtocolRelative(href)) {
    return { shouldHandle: false, reason: "external" };
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
  };
}

/**
 * Check if a URL is external: an absolute HTTP/HTTPS URL or a
 * protocol-relative one ("//host/path")
 *
 * @param href - URL to check
 * @returns True if the URL is external
 */
export function isExternalUrl(href: string): boolean {
  const protocol = getUrlProtocol(href);
  return (
    protocol === "http:" || protocol === "https:" || isProtocolRelative(href)
  );
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
