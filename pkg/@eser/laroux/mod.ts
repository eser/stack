// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * @eser/laroux - Framework-agnostic core utilities for Laroux.js
 *
 * @module
 */

export type {
  LinkConfig,
  ModifierKeys,
  NavigateOptions,
  NavigationAnalysis,
  RouterMethods,
} from "./navigation/mod.ts";
export {
  analyzeNavigation,
  buildLinkConfig,
  isExternalUrl,
  isSpecialProtocol,
  NAVIGATION_EVENT_NAME,
} from "./navigation/mod.ts";

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
} from "./image/mod.ts";
export {
  ASPECT_RATIO_CLASSES,
  buildFallbackHandler,
  buildFormatSrcSet,
  buildImageAttributes,
  buildPictureSources,
  buildPlaceholderStyles,
  combineClassNames,
  DEFAULT_SIZES,
  DEFAULT_WIDTHS,
  getFormatMimeType,
  ImageSizes,
  inferSrcSet,
  OBJECT_FIT_CLASSES,
  parseImageSrc,
  replaceSrcSetExtension,
  shouldShowPlaceholder,
  shouldUsePictureElement,
} from "./image/mod.ts";

export type {
  ApiContext,
  ApiHandler,
  ApiRouteDefinition,
  ApiRouteModule,
  ComponentType,
  HttpMethod,
  RouteDefinition,
  RouteMatch,
  RouteParams,
} from "./router/mod.ts";
export {
  errorResponse,
  findMatchingRoute,
  HttpError,
  jsonResponse,
  matchRoute,
  normalizePath,
} from "./router/mod.ts";

export type {
  AppConfig,
  BrowserShimsConfig,
  CriticalCssConfig,
  FontDefinition,
  FontDisplay,
  FontProvider,
  FontStyle,
  FontWeight,
  ImageConfig,
  ImageOutputFormat,
  ImagePlaceholder,
  LogLevel,
  ResolvedBrowserShimsConfig,
  ResolvedBuildConfig,
  ResolvedCriticalCssConfig,
  ResolvedCriticalCssViewport,
  ResolvedImageConfig,
  ResolvedImageQuality,
  ResolvedInternalConfig,
  ResolvedModeConfig,
  ResolvedServerConfig,
  ResolvedSSRConfig,
  SSRConfig,
  SSRMode,
  SSRStreamMode,
  UserConfig,
} from "./config/mod.ts";
export {
  DEFAULT_BROWSER_SHIMS,
  DEFAULT_BUILD,
  DEFAULT_CONFIG,
  DEFAULT_CRITICAL_CSS,
  DEFAULT_CRITICAL_CSS_VIEWPORT,
  DEFAULT_IMAGE_QUALITY,
  DEFAULT_IMAGES,
  DEFAULT_INTERNAL,
  DEFAULT_MODE,
  DEFAULT_SERVER,
  DEFAULT_SERVER_EXTERNALS,
  DEFAULT_SSR,
  type DefaultConfigShape,
} from "./config/mod.ts";
