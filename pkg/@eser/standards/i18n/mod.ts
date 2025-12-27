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
 * } from "@eser/standards/i18n";
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

export * from "./types.ts";
export * from "./locales.ts";
