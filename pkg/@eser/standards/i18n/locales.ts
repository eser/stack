// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Locale utilities and constants.
 *
 * @module
 */

import type { TextDirection } from "./types.ts";

/**
 * Common locale codes (ISO 639-1 / BCP 47).
 */
export const COMMON_LOCALES = [
  "en",
  "tr",
  "de",
  "fr",
  "es",
  "it",
  "pt-PT",
  "nl",
  "ko",
  "ru",
  "ar",
  "ja",
  "zh-CN",
] as const;

/**
 * Type for common locale codes.
 */
export type CommonLocaleCode = (typeof COMMON_LOCALES)[number];

/**
 * Type guard for common locale codes.
 */
export const isCommonLocale = (value: string): value is CommonLocaleCode =>
  COMMON_LOCALES.includes(value as CommonLocaleCode);

/**
 * Default locale.
 */
export const DEFAULT_LOCALE: CommonLocaleCode = "en";

/**
 * RTL (right-to-left) locales.
 * Based on ISO 639-1 language codes that use RTL scripts.
 */
export const RTL_LOCALES: ReadonlySet<string> = new Set([
  "ar", // Arabic
  "he", // Hebrew
  "fa", // Persian/Farsi
  "ur", // Urdu
  "yi", // Yiddish
  "ps", // Pashto
  "sd", // Sindhi
  "ug", // Uyghur
]);

/**
 * Check if a locale uses RTL (right-to-left) text direction.
 * Handles both simple codes ("ar") and regional variants ("ar-SA").
 */
export const isRtlLocale = (locale: string): boolean => {
  const parts = locale.split("-");
  const baseCode = parts[0] ?? "";
  return RTL_LOCALES.has(baseCode);
};

/**
 * Get text direction for a locale.
 */
export const getTextDirection = (locale: string): TextDirection =>
  isRtlLocale(locale) ? "rtl" : "ltr";

/**
 * Parse a locale string into its components.
 *
 * @example
 * parseLocale("en-US") // { language: "en", region: "US" }
 * parseLocale("zh-CN") // { language: "zh", region: "CN" }
 * parseLocale("fr") // { language: "fr", region: undefined }
 */
export const parseLocale = (
  locale: string,
): { language: string; region: string | undefined } => {
  const parts = locale.split("-");
  return {
    language: parts[0] ?? "",
    region: parts[1],
  };
};

/**
 * Get the base language code from a locale.
 *
 * @example
 * getLanguageCode("en-US") // "en"
 * getLanguageCode("zh-CN") // "zh"
 */
export const getLanguageCode = (locale: string): string =>
  parseLocale(locale).language;
