// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Internationalization utilities and types.
 *
 * Provides locale detection, RTL handling, and i18n type definitions
 * for building internationalized applications.
 *
 * @example
 * ```typescript
 * import * as standards from "@eserstack/standards";
 *
 * // Check if locale is supported
 * standards.i18n.isCommonLocale("en"); // true
 * standards.i18n.isCommonLocale("xx"); // false
 *
 * // Get text direction
 * standards.i18n.getTextDirection("ar"); // "rtl"
 * standards.i18n.getTextDirection("en"); // "ltr"
 *
 * // Use default locale
 * const pickLocale = (userLocale?: string): string =>
 *   userLocale ?? standards.i18n.DEFAULT_LOCALE;
 * pickLocale(); // "en"
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
