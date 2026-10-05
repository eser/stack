// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image Optimization for Laroux
 * Build-time image processing with format conversion and responsive variants
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as patterns from "@eserstack/standards/patterns";
import * as logging from "@eserstack/logging";
import type {
  ImageManifest,
  ImageOptimizationRequest,
  ImageOptimizer,
  ImageVariant,
  OptimizedImage,
} from "../../domain/image-optimizer.ts";

const imageLogger = logging.logger.getLogger(["laroux", "image-optimizer"]);

// sharp is a native module, so it loads on first use instead of at import.
// The dynamic import is untyped; typing it would need sharp's types here.
// deno-lint-ignore no-explicit-any
let sharpModule: any = null;

// Returns the untyped module held in sharpModule
// deno-lint-ignore no-explicit-any
async function getSharp(): Promise<any> {
  if (sharpModule === null) {
    sharpModule = await import("sharp");
  }
  return sharpModule.default ?? sharpModule;
}

/**
 * Image optimization configuration
 */
export type ImageOptimizationConfig = {
  /** Output formats to generate */
  formats?: ("webp" | "avif" | "original")[];
  /** Responsive widths to generate */
  widths?: number[];
  /** Quality settings per format */
  quality?: {
    webp?: number;
    avif?: number;
    jpeg?: number;
    png?: number;
  };
  /** Whether to generate blur placeholder data URLs */
  generateBlurPlaceholder?: boolean;
  /** Placeholder width (for blur data URL) */
  placeholderWidth?: number;
};

const DEFAULT_CONFIG: Required<ImageOptimizationConfig> = {
  formats: ["webp", "original"],
  widths: [640, 768, 1024, 1280, 1920],
  quality: {
    webp: 80,
    avif: 75,
    jpeg: 85,
    png: 90,
  },
  generateBlurPlaceholder: true,
  placeholderWidth: 10,
};

/**
 * Scan for images in a directory
 */
export async function scanImages(dir: string): Promise<string[]> {
  const images: string[] = [];
  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp"];

  async function scan(currentDir: string): Promise<void> {
    try {
      for await (const entry of runtime.fs.readDir(currentDir)) {
        const fullPath = runtime.path.resolve(currentDir, entry.name);

        if (entry.isDirectory) {
          await scan(fullPath);
        } else if (entry.isFile) {
          if (
            patterns.hasExtension(entry.name.toLowerCase(), imageExtensions)
          ) {
            images.push(fullPath);
          }
        }
      }
    } catch {
      // Directory might not exist
    }
  }

  await scan(dir);
  return images;
}

/**
 * Generate blur placeholder data URL
 */
async function generateBlurPlaceholder(
  imagePath: string,
  width: number,
): Promise<string> {
  const sharp = await getSharp();
  const image = sharp(imagePath);

  const buffer = await image
    .resize(width, undefined, { fit: "inside" })
    .blur(5)
    .webp({ quality: 20 })
    .toBuffer();

  return `data:image/webp;base64,${buffer.toString("base64")}`;
}

/**
 * Encode one variant and write it to disk
 * @returns The size of the written file in bytes
 */
async function writeVariant(
  // sharp is loaded lazily through getSharp(), which returns it untyped
  // deno-lint-ignore no-explicit-any
  processedImage: any,
  outputPath: string,
): Promise<number> {
  const outputBuffer: Uint8Array = await processedImage.toBuffer();
  await runtime.fs.writeFile(outputPath, outputBuffer);
  return outputBuffer.length;
}

/**
 * Optimize a single image
 */
export async function optimizeImage(
  imagePath: string,
  outputDir: string,
  publicBasePath: string,
  config: ImageOptimizationConfig = {},
): Promise<OptimizedImage> {
  const sharp = await getSharp();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const image = sharp(imagePath);
  const metadata = await image.metadata();

  if (metadata.width === undefined || metadata.height === undefined) {
    throw new Error(`Could not read image dimensions: ${imagePath}`);
  }

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;
  const aspectRatio = originalWidth / originalHeight;

  const originalExt = runtime.path.extname(imagePath);
  const originalExtBare = originalExt.slice(1).toLowerCase();
  const basename = runtime.path.basename(imagePath, originalExt);
  const publicPath = `${publicBasePath}/${basename}`;

  const variants: ImageVariant[] = [];

  // Every variant is written straight into outputDir
  await runtime.fs.ensureDir(outputDir);

  // Generate variants for each width and format
  for (const width of mergedConfig.widths) {
    // Skip widths larger than original
    if (width > originalWidth) continue;

    const height = Math.round(width / aspectRatio);

    for (const format of mergedConfig.formats) {
      let outputPath: string;
      let outputFormat: string;

      if (format === "original") {
        outputFormat = originalExtBare;
        outputPath = runtime.path.resolve(
          outputDir,
          `${basename}-${width}w.${originalExtBare}`,
        );
      } else {
        outputFormat = format;
        outputPath = runtime.path.resolve(
          outputDir,
          `${basename}-${width}w.${format}`,
        );
      }

      // Process and save
      let processedImage = image.clone().resize(width, height, {
        fit: "cover",
      });

      if (format === "webp") {
        processedImage = processedImage.webp({
          quality: mergedConfig.quality.webp,
        });
      } else if (format === "avif") {
        processedImage = processedImage.avif({
          quality: mergedConfig.quality.avif,
        });
      } else if (outputFormat === "jpg" || outputFormat === "jpeg") {
        processedImage = processedImage.jpeg({
          quality: mergedConfig.quality.jpeg,
        });
      } else if (outputFormat === "png") {
        processedImage = processedImage.png({
          quality: mergedConfig.quality.png,
        });
      }

      // Variants are encoded one at a time so only one encoded buffer is in
      // memory; sharp already spreads each encode over its own thread pool.
      // deno-lint-ignore no-await-in-loop
      const size = await writeVariant(processedImage, outputPath);

      variants.push({
        path: outputPath,
        format: outputFormat,
        width,
        height,
        size,
      });
    }
  }

  // Generate blur placeholder if enabled
  let blurDataUrl: string | undefined;
  if (mergedConfig.generateBlurPlaceholder) {
    blurDataUrl = await generateBlurPlaceholder(
      imagePath,
      mergedConfig.placeholderWidth,
    );
  }

  return {
    originalPath: imagePath,
    publicPath,
    originalWidth,
    originalHeight,
    variants,
    blurDataUrl,
    aspectRatio,
  };
}

/**
 * Optimize all images in a directory
 */
export async function optimizeImages(
  inputDir: string,
  outputDir: string,
  publicBasePath: string = "/images",
  config: ImageOptimizationConfig = {},
): Promise<ImageManifest> {
  imageLogger.info(`Scanning for images in ${inputDir}...`);

  const imagePaths = await scanImages(inputDir);

  if (imagePaths.length === 0) {
    imageLogger.debug("No images found to optimize");
    return {
      timestamp: Date.now(),
      images: {},
    };
  }

  imageLogger.info(`Found ${imagePaths.length} image(s) to optimize`);

  const images: Record<string, OptimizedImage> = {};
  let totalOriginalSize = 0;
  let totalOptimizedSize = 0;

  for (const imagePath of imagePaths) {
    try {
      // Images are optimized one at a time to bound memory: each holds its
      // decoded pixels and encoded variants until it finishes.
      // deno-lint-ignore no-await-in-loop
      const originalStat = await runtime.fs.stat(imagePath);
      totalOriginalSize += originalStat.size;

      // Sequential for the same memory bound as the stat above
      // deno-lint-ignore no-await-in-loop
      const optimized = await optimizeImage(
        imagePath,
        outputDir,
        publicBasePath,
        config,
      );

      images[imagePath] = optimized;

      const variantSize = optimized.variants.reduce(
        (sum, v) => sum + v.size,
        0,
      );
      totalOptimizedSize += variantSize;

      imageLogger.debug(
        `Optimized: ${
          runtime.path.basename(imagePath)
        } → ${optimized.variants.length} variants`,
      );
    } catch (error) {
      imageLogger.with({ error }).warn(
        `optimize ${imagePath}; leaving it out of the image manifest`,
      );
    }
  }

  const manifest: ImageManifest = {
    timestamp: Date.now(),
    images,
  };

  // Save manifest
  const manifestPath = runtime.path.resolve(outputDir, "image-manifest.json");
  await runtime.fs.ensureDir(runtime.path.dirname(manifestPath));
  await runtime.fs.writeTextFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
  );

  const savedPercent = totalOriginalSize > 0
    ? ((1 - totalOptimizedSize / totalOriginalSize) * 100).toFixed(1)
    : 0;

  imageLogger.info(
    `Image optimization complete: ${imagePaths.length} images, ${savedPercent}% size reduction`,
  );

  return manifest;
}

/**
 * Generate srcset string for an optimized image
 */
export function generateSrcset(
  image: OptimizedImage,
  format: string = "webp",
): string {
  const variants = image.variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width);

  return variants
    .map((v) => `${v.path} ${v.width}w`)
    .join(", ");
}

/**
 * Get the best variant for a given width
 */
export function getBestVariant(
  image: OptimizedImage,
  targetWidth: number,
  format: string = "webp",
): ImageVariant | undefined {
  const variants = image.variants
    .filter((v) => v.format === format)
    .sort((a, b) => a.width - b.width);

  // Find the smallest variant that's at least as wide as target
  return variants.find((v) => v.width >= targetWidth) ?? variants.at(-1);
}

/**
 * Image optimizer that encodes the images with sharp: responsive variants in
 * the configured formats, widths and quality, a blur placeholder when the
 * config's placeholder is "blur", and image-manifest.json in the output
 * directory. Pass it to the build as `imageOptimizer`.
 */
export const sharpImageOptimizer: ImageOptimizer = {
  name: "sharp",
  optimize: (request: ImageOptimizationRequest): Promise<ImageManifest> =>
    optimizeImages(request.inputDir, request.outputDir, request.publicPath, {
      formats: request.config.formats,
      widths: request.config.widths,
      quality: request.config.quality,
      generateBlurPlaceholder: request.config.placeholder === "blur",
    }),
};
