// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Sharp Image Optimizer Adapter
 * Image processing with Sharp library
 */

export type {
  ImageManifest,
  ImageVariant,
  OptimizedImage,
} from "../../domain/image-optimizer.ts";

export {
  generateSrcset,
  getBestVariant,
  type ImageOptimizationConfig,
  optimizeImage,
  optimizeImages,
  scanImages,
  sharpImageOptimizer,
} from "./image-optimizer.ts";
