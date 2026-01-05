// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * HTML Shell Port Interface
 * Defines the contract for HTML document generation
 */

import type { ChunkManifest } from "@eser/laroux-bundler";

/**
 * Options for generating HTML shell
 */
export type HtmlShellOptions = {
  /** Content for <head> section */
  head?: string;
  /** Content for <body> section */
  body?: string;
  /** Script URLs to include */
  scripts?: string[];
  /** Stylesheet URLs to include */
  styles?: string[];
  /** Critical CSS to inline */
  criticalCss?: string;
  /** Serialized RSC payload for hydration */
  rscPayload?: string;
  /** Chunk manifest for client-side loading */
  manifest?: ChunkManifest;
  /** Page title */
  title?: string;
  /** Language attribute */
  lang?: string;
};

/**
 * HTML Shell Builder port interface
 * Framework adapters implement this for framework-specific HTML generation
 */
export type HtmlShellBuilder = {
  /** Builder name for identification */
  name: string;

  /**
   * Create complete HTML document
   * @param options - Shell generation options
   */
  createShell(options: HtmlShellOptions): string;

  /**
   * Create start of streaming HTML document (for SSR streaming)
   * @param options - Shell generation options
   */
  createStreamingStart(options: HtmlShellOptions): string;

  /**
   * Create end of streaming HTML document
   * @param options - Shell generation options
   */
  createStreamingEnd(options: HtmlShellOptions): string;
};

/**
 * No-op HTML shell builder
 * Used as default when no builder is configured
 */
export const noopHtmlShellBuilder: HtmlShellBuilder = {
  name: "noop",
  createShell: () => "<!DOCTYPE html><html><head></head><body></body></html>",
  createStreamingStart: () => "<!DOCTYPE html><html><head></head><body>",
  createStreamingEnd: () => "</body></html>",
};
