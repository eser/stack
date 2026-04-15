// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Internationalization utilities and types.
 *
 * Provides locale detection, RTL handling, and i18n type definitions
 * for building internationalized applications.
 *
 * @example
 * ```typescript
 * import {
 *   isCommonLocale,
 *   isRtlLocale,
 *   getTextDirection,
 *   DEFAULT_LOCALE,
 * } from "@eserstack/standards/i18n";
 *
 * // Check if locale is supported
 * isCommonLocale("en"); // true
 * isCommonLocale("xx"); // false
 *
 * // Get text direction
 * getTextDirection("ar"); // "rtl"
 * getTextDirection("en"); // "ltr"
 *
 * // Use default locale
 * const locale = userLocale ?? DEFAULT_LOCALE; // "en"
 * ```
 *
 * @module
 */

export {
  type LocaleInfo,
  type Messages,
  type TextDirection,
  type TranslateFn,
} from "./types.ts";
export {
  COMMON_LOCALES,
  type CommonLocaleCode,
  DEFAULT_LOCALE,
  getLanguageCode,
  getTextDirection,
  isCommonLocale,
  isRtlLocale,
  parseLocale,
  RTL_LOCALES,
} from "./locales.ts";
