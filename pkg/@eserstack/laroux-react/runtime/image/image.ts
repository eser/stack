// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Optimized Image component for Laroux.js
 * Provides lazy loading, responsive sizing, modern formats, and layout shift prevention
 */

import * as React from "react";
import type {
  AspectRatioValue,
  ImageFormat,
  ImageProps,
  ObjectFitValue,
  PlaceholderType,
  ResponsiveImageProps,
} from "@eserstack/laroux/image";
import * as image from "@eserstack/laroux/image";
import * as imageFallback from "./fallback.ts";

// Re-export types for component consumers, with the types their props use
export type {
  AspectRatioValue,
  ImageFormat,
  ImageProps,
  ObjectFitValue,
  PlaceholderType,
  ResponsiveImageProps,
};
export { ImageSizes } from "@eserstack/laroux/image";

/**
 * Server Component - Optimized image with lazy loading, modern formats, and CLS prevention
 *
 * Features:
 * - Lazy loading by default (eager for priority images)
 * - Width/height attributes prevent Cumulative Layout Shift (CLS)
 * - Modern format support (WebP, AVIF) via picture element
 * - Responsive images with srcset
 * - Blur placeholder support
 * - Decoding async for better performance
 * - fetchpriority for above-the-fold images
 *
 * `fallback` replaces the source when it is empty, and when it fails to load
 * in the browser. The fallback travels as a data attribute rather than an
 * `onError` handler, because laroux serializes server components as JSON and
 * drops functions; the laroux client bootstrap applies it.
 */
export function Image(props: ImageProps): React.ReactElement {
  const fallback = props.fallback ?? "";
  const hasFallback = fallback !== "";
  const imgAttributes = image.buildImageAttributes(props);
  const placeholderStyles = image.buildPlaceholderStyles(
    props.placeholder,
    props.blurDataURL,
  );

  // An image without a source shows its fallback straight away, without the
  // format variants derived from the missing source. srcSet and sizes are left
  // out too: the browser prefers srcset over src, so it would hide the fallback.
  if (props.src === "" && hasFallback) {
    const {
      srcSet: _srcSet,
      sizes: _sizes,
      ...fallbackImgAttributes
    } = imgAttributes;

    return React.createElement("img", {
      ...fallbackImgAttributes,
      src: fallback,
      style: placeholderStyles,
    });
  }

  const fallbackAttributes = hasFallback
    ? { [imageFallback.FALLBACK_ATTRIBUTE]: fallback }
    : {};
  const formats = props.formats ?? [];

  if (image.shouldUsePictureElement(formats)) {
    const sources = image.buildPictureSources({
      ...image.parseImageSrc(props.src),
      formats,
      srcSet: props.srcSet,
      sizes: props.sizes,
    });

    return React.createElement(
      "picture",
      { style: placeholderStyles },
      sources.map((source) =>
        React.createElement("source", {
          key: source.type,
          type: source.type,
          srcSet: source.srcSet,
          sizes: source.sizes,
        }),
      ),
      React.createElement("img", {
        ...imgAttributes,
        ...fallbackAttributes,
        src: props.src,
      }),
    );
  }

  return React.createElement("img", {
    ...imgAttributes,
    ...fallbackAttributes,
    src: props.src,
    style: placeholderStyles,
  });
}

/**
 * Server Component - Responsive image with aspect ratio container
 * Prevents layout shift with CSS aspect-ratio
 */
export function ResponsiveImage(
  props: ResponsiveImageProps,
): React.ReactElement {
  const aspectRatio: AspectRatioValue = props.aspectRatio ?? "16/9";
  const aspectRatioClass = image.ASPECT_RATIO_CLASSES[aspectRatio];
  const hasBlur = image.shouldShowPlaceholder("blur", props.blurDataURL);

  return React.createElement(
    "div",
    {
      className: `relative overflow-hidden ${aspectRatioClass} ${
        props.containerClassName ?? ""
      }`.trim(),
    },
    React.createElement(Image, {
      src: props.src,
      alt: props.alt,
      className:
        `absolute inset-0 w-full h-full ${props.className ?? ""}`.trim(),
      priority: props.priority ?? false,
      fallback: props.fallback,
      sizes: props.sizes ?? image.DEFAULT_SIZES,
      formats: props.formats,
      placeholder: hasBlur ? "blur" : undefined,
      blurDataURL: props.blurDataURL,
    }),
  );
}
