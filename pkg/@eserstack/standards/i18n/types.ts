// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Internationalization types.
 *
 * @module
 */

/**
 * Text direction for locales.
 */
export type TextDirection = "ltr" | "rtl";

/**
 * Locale metadata with name and direction.
 */
export interface LocaleInfo {
  /** Locale code, such as "en" or "pt-PT". */
  readonly code: string;
  /** Name of the language in English. */
  readonly name: string;
  /** Name of the language in the language itself. */
  readonly nativeName: string;
  /** Text direction of the script. */
  readonly direction: TextDirection;
}

/**
 * Translation messages - nested namespace structure.
 */
export interface Messages {
  /** Messages of one namespace, keyed by message key. */
  readonly [namespace: string]: {
    readonly [key: string]: string;
  };
}

/**
 * Translation function signature.
 */
export type TranslateFn = (
  namespace: string,
  key: string,
  params?: Readonly<Record<string, string | number>>,
) => string;
