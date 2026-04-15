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
  src: string;
  alt: string;
  aspectRatio?: AspectRatioValue;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
  fallback?: string;
  sizes?: string;
  formats?: ImageFormat[];
  blurDataURL?: string;
}

/**
 * Computed image attributes for rendering
 */
export interface ImageAttributes {
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  loading: "eager" | "lazy";
  decoding: "async";
  fetchPriority: "high" | "auto";
  sizes?: string;
  srcSet?: string;
}

/**
 * Source element configuration for picture element
 */
export interface PictureSource {
  type: string;
  srcSet: string;
  sizes?: string;
}

/**
 * Placeholder style configuration
 */
export interface PlaceholderStyles {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
}

/**
 * Parsed image source information
 */
export interface ParsedImageSrc {
  basePath: string;
  ext: string;
}
