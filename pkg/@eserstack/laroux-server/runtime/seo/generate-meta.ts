// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * SEO metadata generator for Laroux.js
 */

import type { PageMetadata, SeoConfig } from "./types.ts";

/**
 * Generate HTML meta tags from SEO config
 */
export function generateMetaTags(
  config: SeoConfig,
  pageMetadata?: PageMetadata,
): string {
  const meta = { ...config, ...pageMetadata };
  const tags: string[] = [];

  // Basic meta tags
  if (meta.description) {
    tags.push(
      `<meta name="description" content="${escapeHtml(meta.description)}">`,
    );
  }

  if (meta.keywords && meta.keywords.length > 0) {
    tags.push(
      `<meta name="keywords" content="${
        escapeHtml(meta.keywords.join(", "))
      }">`,
    );
  }

  if (meta.author) {
    tags.push(`<meta name="author" content="${escapeHtml(meta.author)}">`);
  }

  if (meta.themeColor) {
    tags.push(`<meta name="theme-color" content="${meta.themeColor}">`);
  }

  // Robots directives
  const robotsDirectives: string[] = [];
  if (meta.noIndex) robotsDirectives.push("noindex");
  if (meta.noFollow) robotsDirectives.push("nofollow");
  if (robotsDirectives.length > 0) {
    tags.push(`<meta name="robots" content="${robotsDirectives.join(", ")}">`);
  }

  // Canonical URL
  if (meta.canonicalUrl) {
    tags.push(`<link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}">`);
  }

  // Open Graph tags
  tags.push(`<meta property="og:type" content="${meta.ogType || "website"}">`);
  tags.push(`<meta property="og:title" content="${escapeHtml(meta.title)}">`);

  if (meta.description) {
    tags.push(
      `<meta property="og:description" content="${
        escapeHtml(meta.description)
      }">`,
    );
  }

  if (meta.siteUrl) {
    tags.push(`<meta property="og:url" content="${escapeHtml(meta.siteUrl)}">`);
  }

  if (meta.siteName) {
    tags.push(
      `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}">`,
    );
  }

  if (meta.locale) {
    tags.push(`<meta property="og:locale" content="${meta.locale}">`);
  }

  if (meta.ogImage) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(meta.ogImage)}">`,
    );
    tags.push(
      `<meta property="og:image:alt" content="${escapeHtml(meta.title)}">`,
    );
  }

  // Twitter Card tags
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  tags.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}">`);

  if (meta.description) {
    tags.push(
      `<meta name="twitter:description" content="${
        escapeHtml(meta.description)
      }">`,
    );
  }

  if (meta.twitterHandle) {
    tags.push(
      `<meta name="twitter:site" content="${escapeHtml(meta.twitterHandle)}">`,
    );
    tags.push(
      `<meta name="twitter:creator" content="${
        escapeHtml(meta.twitterHandle)
      }">`,
    );
  }

  if (meta.ogImage) {
    tags.push(
      `<meta name="twitter:image" content="${escapeHtml(meta.ogImage)}">`,
    );
  }

  // Favicon
  if (meta.favicon) {
    tags.push(`<link rel="icon" href="${escapeHtml(meta.favicon)}">`);
  }

  return tags.join("\n  ");
}

/**
 * Generate JSON-LD structured data
 */
export function generateJsonLd(
  config: SeoConfig,
  pageMetadata?: PageMetadata,
): string {
  const meta = { ...config, ...pageMetadata };

  // Default website structured data
  const websiteSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: meta.siteName,
    url: meta.siteUrl,
    description: meta.description,
  };

  // Organization schema
  const organizationSchema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: meta.siteName,
    url: meta.siteUrl,
    logo: meta.ogImage,
  };

  // Combine with custom JSON-LD
  const schemas = [websiteSchema, organizationSchema];

  if (meta.jsonLd) {
    schemas.push({
      "@context": "https://schema.org",
      ...meta.jsonLd,
    });
  }

  return schemas
    .map((schema) =>
      `<script type="application/ld+json">${JSON.stringify(schema)}</script>`
    )
    .join("\n  ");
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
