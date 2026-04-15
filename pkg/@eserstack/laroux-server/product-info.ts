// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Product Information Loader
 * Loads product metadata from product.json
 */

import { runtime } from "@eserstack/standards/cross-runtime";

export type ProductInfo = {
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  license: string;
  repository: string;
  homepage: string;
};

let cachedProductInfo: ProductInfo | null = null;

/**
 * Load product information from product.json
 * Caches the result for subsequent calls
 */
export async function getProductInfo(): Promise<ProductInfo> {
  if (cachedProductInfo) {
    return cachedProductInfo;
  }

  try {
    // Try to load from project root
    const productJsonPath = runtime.path.resolve(
      new URL(".", import.meta.url).pathname,
      "../../product.json",
    );
    const content = await runtime.fs.readTextFile(productJsonPath);
    cachedProductInfo = JSON.parse(content);
    return cachedProductInfo!;
  } catch {
    // Fallback to default values if product.json is not found
    cachedProductInfo = {
      name: "laroux",
      displayName: "Laroux.js",
      version: "0.0.0",
      description: "A modern React Server Components framework powered by Deno",
      author: "Unknown",
      license: "Apache-2.0",
      repository: "",
      homepage: "",
    };
    return cachedProductInfo;
  }
}

/**
 * Get product version (for CLI usage)
 * Reads the product.json file directly
 */
export async function getProductVersion(): Promise<string> {
  try {
    const productJsonPath = runtime.path.resolve(
      new URL(".", import.meta.url).pathname,
      "../../product.json",
    );
    const content = await runtime.fs.readTextFile(productJsonPath);
    const product = JSON.parse(content);
    return product.version;
  } catch {
    return "0.0.0";
  }
}
