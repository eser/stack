// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Navigation types for framework-agnostic navigation utilities
 *
 * @module
 */

/**
 * Options for navigation actions
 */
export interface NavigateOptions {
  /** Whether to scroll to top after navigation */
  scroll?: boolean;
}

/**
 * Router methods for programmatic navigation
 */
export interface RouterMethods {
  /** Navigate to a new URL, adding to history */
  push: (href: string, options?: NavigateOptions) => void;
  /** Navigate to a URL, replacing current history entry */
  replace: (href: string, options?: NavigateOptions) => void;
  /** Go back in history */
  back: () => void;
  /** Go forward in history */
  forward: () => void;
  /** Refresh the current page */
  refresh: () => void;
}

/**
 * Configuration for a link element
 */
export interface LinkConfig {
  /** Target URL */
  href: string;
  /** Whether to replace instead of push history */
  replace?: boolean;
  /** Whether to scroll to top after navigation */
  scroll?: boolean;
  /** Whether to prefetch the target */
  prefetch?: boolean;
}

/**
 * Result of analyzing whether navigation should be handled
 */
export interface NavigationAnalysis {
  /** Whether the navigation should be handled by the router */
  shouldHandle: boolean;
  /** Reason why navigation should not be handled */
  reason?: "external" | "mailto" | "tel" | "hash" | "modifier-key";
}

/**
 * Modifier key state during a click event
 */
export interface ModifierKeys {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}
