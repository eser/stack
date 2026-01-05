// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Image module - Framework-agnostic image utilities
 *
 * @module
 */

// Types
export type {
  AspectRatioValue,
  ImageAttributes,
  ImageFormat,
  ImageProps,
  ObjectFitValue,
  ParsedImageSrc,
  PictureSource,
  PlaceholderStyles,
  PlaceholderType,
  ResponsiveImageProps,
} from "./types.ts";

// Presets and constants
export {
  ASPECT_RATIO_CLASSES,
  DEFAULT_SIZES,
  DEFAULT_WIDTHS,
  ImageSizes,
  OBJECT_FIT_CLASSES,
} from "./presets.ts";

// Srcset utilities
export {
  buildFormatSrcSet,
  inferSrcSet,
  replaceSrcSetExtension,
} from "./srcset-builder.ts";

// Image config utilities
export {
  buildFallbackHandler,
  buildImageAttributes,
  combineClassNames,
  parseImageSrc,
} from "./image-config.ts";

// Placeholder utilities
export {
  buildPlaceholderStyles,
  shouldShowPlaceholder,
} from "./placeholder.ts";

// Picture element utilities
export {
  buildPictureSources,
  getFormatMimeType,
  shouldUsePictureElement,
} from "./picture-sources.ts";
