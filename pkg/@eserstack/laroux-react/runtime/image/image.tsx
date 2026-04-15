// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Optimized Image component for Laroux.js
 * Provides lazy loading, responsive sizing, modern formats, and layout shift prevention
 */

import type {
  AspectRatioValue,
  ImageFormat,
  ImageProps,
  ResponsiveImageProps,
} from "@eserstack/laroux/image";
import {
  ASPECT_RATIO_CLASSES,
  buildImageAttributes,
  buildPictureSources,
  buildPlaceholderStyles,
  ImageSizes,
  parseImageSrc,
  shouldUsePictureElement,
} from "@eserstack/laroux/image";

// Re-export types for component consumers
export type { ImageProps, ResponsiveImageProps };
export { ImageSizes };

/**
 * Server Component - Optimized image with lazy loading, modern formats, and CLS prevention
 *
 * Features:
 * - Lazy loading by default (eager for priority images)
 * - Width/height attributes prevent Cumulative Layout Shift (CLS)
 * - Modern format support (WebP, AVIF) via picture element
 * - Responsive images with srcset
 * - Blur placeholder support
 * - Fallback image support
 * - Decoding async for better performance
 * - fetchpriority for above-the-fold images
 */
export function Image(props: ImageProps): React.ReactElement {
  const {
    src,
    fallback,
    formats = [],
    srcSet,
    sizes,
    placeholder,
    blurDataURL,
  } = props;

  // Build framework-agnostic attributes
  const imgAttributes = buildImageAttributes(props);

  // Build placeholder styles
  const placeholderStyles = buildPlaceholderStyles(placeholder, blurDataURL);

  // Error handler for fallback
  const handleError = fallback
    ? `(function(e) { if (e.target.src !== '${fallback}') e.target.src = '${fallback}'; })(event)`
    : undefined;

  if (shouldUsePictureElement(formats)) {
    // Get base path and extension for format variants
    const { basePath, ext } = parseImageSrc(src);

    // Build picture sources
    const sources = buildPictureSources(
      basePath,
      ext,
      formats as ImageFormat[],
      srcSet,
      sizes,
    );

    return (
      <picture style={placeholderStyles}>
        {sources.map((source) => (
          <source
            key={source.type}
            type={source.type}
            srcSet={source.srcSet}
            sizes={source.sizes}
          />
        ))}
        <img
          {...imgAttributes}
          src={src}
          onError={handleError ? undefined : undefined}
          data-onerror={handleError}
        />
      </picture>
    );
  }

  return (
    <img
      {...imgAttributes}
      src={src}
      style={placeholderStyles}
      onError={fallback
        ? (e) => {
          const target = e.currentTarget;
          if (target.src !== fallback) {
            target.src = fallback;
          }
        }
        : undefined}
    />
  );
}

/**
 * Server Component - Responsive image with aspect ratio container
 * Prevents layout shift with CSS aspect-ratio
 */
export function ResponsiveImage(
  props: ResponsiveImageProps,
): React.ReactElement {
  const {
    src,
    alt,
    aspectRatio = "16/9",
    className = "",
    containerClassName = "",
    priority = false,
    fallback,
    sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
    formats,
    blurDataURL,
  } = props;

  const aspectRatioClass =
    ASPECT_RATIO_CLASSES[aspectRatio as AspectRatioValue] ?? "aspect-video";

  return (
    <div
      className={`relative overflow-hidden ${aspectRatioClass} ${containerClassName}`
        .trim()}
    >
      <Image
        src={src}
        alt={alt}
        className={`absolute inset-0 w-full h-full ${className}`.trim()}
        priority={priority}
        fallback={fallback}
        sizes={sizes}
        formats={formats}
        placeholder={blurDataURL ? "blur" : undefined}
        blurDataURL={blurDataURL}
      />
    </div>
  );
}
