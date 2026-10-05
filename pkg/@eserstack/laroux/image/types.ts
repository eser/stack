// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image types for framework-agnostic image utilities
 *
 * @module
 */

/**
 * Object fit CSS values
 */
export type ObjectFitValue =
  | "cover"
  | "contain"
  | "fill"
  | "none"
  | "scale-down";

/**
 * Placeholder types for images
 */
export type PlaceholderType = "blur" | "empty";

/**
 * Supported modern image formats
 */
export type ImageFormat = "webp" | "avif";

/**
 * Aspect ratio presets
 */
export type AspectRatioValue = "16/9" | "4/3" | "1/1" | "3/2";

/**
 * Image component props (framework-agnostic)
 */
export interface ImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** Additional CSS classes */
  className?: string;
  /** Load immediately (above-the-fold) */
  priority?: boolean;
  /** Fallback image on error */
  fallback?: string;
  /** Object fit mode */
  objectFit?: ObjectFitValue;
  /** Responsive sizes attribute */
  sizes?: string;
  /** Quality hint (1-100) */
  quality?: number;
  /** Placeholder type */
  placeholder?: PlaceholderType;
  /** Blur placeholder data URL */
  blurDataURL?: string;
  /** Supported formats for picture element */
  formats?: ImageFormat[];
  /** Srcset for responsive images */
  srcSet?: string;
}

/**
 * Responsive image component props (framework-agnostic)
 */
export interface ResponsiveImageProps {
  /** Image source URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Aspect ratio of the container; "16/9" when absent */
  aspectRatio?: AspectRatioValue;
  /** Additional CSS classes for the image */
  className?: string;
  /** Additional CSS classes for the container */
  containerClassName?: string;
  /** Load immediately (above-the-fold) */
  priority?: boolean;
  /** Fallback image on error */
  fallback?: string;
  /** Responsive sizes attribute */
  sizes?: string;
  /** Supported formats for picture element */
  formats?: ImageFormat[];
  /** Blur placeholder data URL; a blur placeholder shows when it is not empty */
  blurDataURL?: string;
}

/**
 * Computed image attributes for rendering
 */
export interface ImageAttributes {
  /** Alt text for accessibility */
  alt: string;
  /** Image width */
  width?: number;
  /** Image height */
  height?: number;
  /** CSS classes */
  className?: string;
  /** "eager" for priority images, "lazy" otherwise */
  loading: "eager" | "lazy";
  /** Always "async", so decoding does not block rendering */
  decoding: "async";
  /** "high" for priority images, "auto" otherwise */
  fetchPriority: "high" | "auto";
  /** Responsive sizes attribute */
  sizes?: string;
  /** Srcset for responsive images */
  srcSet?: string;
}

/**
 * Source element configuration for picture element
 */
export interface PictureSource {
  /** MIME type of the source, such as "image/avif" */
  type: string;
  /** Srcset of the source in its format */
  srcSet: string;
  /** Responsive sizes attribute */
  sizes?: string;
}

/**
 * Options for `buildPictureSources()`. `basePath` and `ext` match the
 * fields `parseImageSrc()` returns, so its result can be spread in.
 */
export interface PictureSourcesOptions {
  /** The image path without its extension, such as "/images/photo". */
  readonly basePath: string;
  /** The original extension without the dot, such as "jpg"; "" for none. */
  readonly ext: string;
  /** The formats to build a source for; AVIF comes first whatever the order. */
  readonly formats: readonly ImageFormat[];
  /**
   * A srcset of the original image, with `ext` replaced for each format. When
   * absent, each format's srcset is inferred from `basePath`.
   */
  readonly srcSet?: string;
  /** The `sizes` attribute every source carries. */
  readonly sizes?: string;
}

/**
 * Placeholder style configuration
 */
export interface PlaceholderStyles {
  /** The blur image as a CSS `url()` */
  backgroundImage: string;
  /** Always "cover" */
  backgroundSize: string;
  /** Always "center" */
  backgroundPosition: string;
}

/**
 * Parsed image source information
 */
export interface ParsedImageSrc {
  /** The source without its extension */
  basePath: string;
  /** The extension without the dot; "" when the file name has none */
  ext: string;
}
