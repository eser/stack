// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React HTML Shell Builder
 * Implements the HtmlShellBuilder port interface for React applications
 */

import type {
  HtmlShellBuilder,
  HtmlShellOptions,
} from "../../domain/html-shell.ts";

/**
 * Generate script tags from URLs
 */
function generateScriptTags(scripts: string[]): string {
  return scripts
    .map((src) => `<script type="module" src="${escapeHtml(src)}"></script>`)
    .join("\n    ");
}

/**
 * Generate link tags for stylesheets
 */
function generateStyleTags(styles: string[]): string {
  return styles
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`)
    .join("\n    ");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Create a React HTML shell builder
 *
 * @returns HtmlShellBuilder implementation for React
 */
export function createReactHtmlShellBuilder(): HtmlShellBuilder {
  return {
    name: "react",

    createShell(options: HtmlShellOptions): string {
      const {
        head = "",
        body = "",
        scripts = [],
        styles = [],
        criticalCss,
        rscPayload,
        manifest,
        title = "",
        lang = "en",
      } = options;

      const stylesTags = generateStyleTags(styles);
      const scriptsTags = generateScriptTags(scripts);
      const criticalCssTag = criticalCss
        ? `<style id="__critical_css__">${criticalCss}</style>`
        : "";

      // Serialize manifest for client-side chunk loading
      const manifestScript = manifest
        ? `<script id="__CHUNK_MANIFEST__" type="application/json">${
          JSON.stringify(manifest).replace(/<\/script/gi, "<\\/script")
        }</script>`
        : "";

      return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${stylesTags}
    ${criticalCssTag}
    ${head}
  </head>
  <body>
    <div id="root">${body}</div>
    ${rscPayload ?? ""}
    ${manifestScript}
    ${scriptsTags}
  </body>
</html>`;
    },

    createStreamingStart(options: HtmlShellOptions): string {
      const {
        head = "",
        styles = [],
        criticalCss,
        title = "",
        lang = "en",
      } = options;

      const stylesTags = generateStyleTags(styles);
      const criticalCssTag = criticalCss
        ? `<style id="__critical_css__">${criticalCss}</style>`
        : "";

      return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    ${stylesTags}
    ${criticalCssTag}
    ${head}
  </head>
  <body>
    <div id="root">`;
    },

    createStreamingEnd(options: HtmlShellOptions): string {
      const {
        scripts = [],
        rscPayload,
        manifest,
      } = options;

      const scriptsTags = generateScriptTags(scripts);

      // Serialize manifest for client-side chunk loading
      const manifestScript = manifest
        ? `<script id="__CHUNK_MANIFEST__" type="application/json">${
          JSON.stringify(manifest).replace(/<\/script/gi, "<\\/script")
        }</script>`
        : "";

      return `</div>
    ${rscPayload ?? ""}
    ${manifestScript}
    ${scriptsTags}
  </body>
</html>`;
    },
  };
}

/**
 * Default React HTML shell builder instance
 */
export const reactHtmlShellBuilder = createReactHtmlShellBuilder();
