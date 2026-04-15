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
  readonly code: string;
  readonly name: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
}

/**
 * Translation messages - nested namespace structure.
 */
export interface Messages {
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
