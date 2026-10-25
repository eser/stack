// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * @eserstack/laroux-react - React components for Laroux.js
 *
 * @module
 */

// Navigation components
export { Link } from "./runtime/navigation/link.ts";
export type { LinkProps } from "./runtime/navigation/link.ts";

export { useRouter } from "./runtime/navigation/use-router.ts";
export type {
  NavigateOptions,
  RouterMethods,
} from "@eserstack/laroux/navigation";

// Image components
export { Image, ImageSizes, ResponsiveImage } from "./runtime/image/image.ts";
export type {
  AspectRatioValue,
  ImageFormat,
  ImageProps,
  ObjectFitValue,
  PlaceholderType,
  ResponsiveImageProps,
} from "./runtime/image/image.ts";

// Span rendering
export { react as reactRenderer, SpanView } from "./span-renderer.ts";

// Function integration
export { runFunction } from "./use-function.ts";
export type { FunctionContext, RunFunctionOptions } from "./use-function.ts";
