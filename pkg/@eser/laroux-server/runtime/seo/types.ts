// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * SEO types for Laroux.js
 */

export type SeoConfig = {
  title: string;
  description: string;
  siteName: string;
  siteUrl: string;
  locale?: string;
  themeColor?: string;
  favicon?: string;
  twitterHandle?: string;
  ogImage?: string;
  ogType?: "website" | "article" | "profile";
  keywords?: string[];
  author?: string;
  canonicalUrl?: string;
  noIndex?: boolean;
  noFollow?: boolean;
  jsonLd?: Record<string, unknown>;
};

export type PageMetadata = Partial<SeoConfig> & {
  title?: string;
  description?: string;
};
