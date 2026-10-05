// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image Optimizer Port
 *
 * Turns the images under public/images into responsive variants in modern
 * formats, with optional blur placeholders, and describes them in an image
 * manifest. The sharp adapter (adapters/sharp) implements it.
 */

import type { ResolvedImageConfig } from "@eserstack/laroux/config";

/** One encoded variant of an image. */
export type ImageVariant = {
  /** Output file path */
  path: string;
  /** Format (webp, avif, jpeg, png) */
  format: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** File size in bytes */
  size: number;
};

/** The variants and metadata of one optimized image. */
export type OptimizedImage = {
  /** Original image path */
  originalPath: string;
  /** Public URL path (without extension for format selection) */
  publicPath: string;
  /** Original width */
  originalWidth: number;
  /** Original height */
  originalHeight: number;
  /** Generated variants */
  variants: ImageVariant[];
  /** Blur placeholder data URL (if generated) */
  blurDataUrl?: string;
  /** Aspect ratio (width / height) */
  aspectRatio: number;
};

/** Image manifest for runtime */
export type ImageManifest = {
  /** Build timestamp */
  timestamp: number;
  /** Map of original paths to optimized images */
  images: Record<string, OptimizedImage>;
};

/** What a {@link ImageOptimizer} optimizes and where it writes the result. */
export type ImageOptimizationRequest = {
  /** Directory the source images are read from, such as public/images */
  readonly inputDir: string;
  /** Directory the variants are written to */
  readonly outputDir: string;
  /** URL path the variants are served under, such as "/images" */
  readonly publicPath: string;
  /** Formats, widths, quality and placeholder from the app config */
  readonly config: ResolvedImageConfig;
};

/** Optimizes the app's images at build time. */
export type ImageOptimizer = {
  /** Optimizer name for logs */
  readonly name: string;
  /**
   * Optimize every image under request.inputDir.
   *
   * @param request - Input and output directories and the image config
   * @returns The manifest of the optimized images, or null when this
   *   optimizer does not optimize images
   */
  optimize: (
    request: ImageOptimizationRequest,
  ) => Promise<ImageManifest | null>;
};

/**
 * Image optimizer for builds that pass none: it optimizes nothing, so the
 * images are served as they are in public/images.
 */
export const noopImageOptimizer: ImageOptimizer = {
  name: "noop",
  optimize: () => Promise.resolve(null),
};
