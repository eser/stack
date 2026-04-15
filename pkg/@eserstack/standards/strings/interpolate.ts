// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * String interpolation utilities.
 *
 * @module
 */

/**
 * Interpolate a template string with parameters.
 * Replaces `{key}` placeholders with values from params.
 *
 * @example
 * interpolate("Hello {name}!", { name: "World" })
 * // "Hello World!"
 *
 * interpolate("Item {id} costs ${price}", { id: 42, price: 9.99 })
 * // "Item 42 costs $9.99"
 *
 * @param template - The template string with {key} placeholders
 * @param params - Object containing values for placeholders
 * @returns The interpolated string
 */
export const interpolate = (
  template: string,
  params: Readonly<Record<string, unknown>>,
): string => {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
};

/**
 * Create an interpolation function bound to a template.
 * Useful for reusing the same template with different parameters.
 *
 * @example
 * const greet = createInterpolator("Hello {name}!");
 * greet({ name: "Alice" }) // "Hello Alice!"
 * greet({ name: "Bob" })   // "Hello Bob!"
 *
 * @param template - The template string with {key} placeholders
 * @returns A function that takes params and returns the interpolated string
 */
export const createInterpolator = (
  template: string,
): (params: Readonly<Record<string, unknown>>) => string =>
(params) => interpolate(template, params);

/**
 * Extract placeholder keys from a template string.
 *
 * @example
 * extractPlaceholders("Hello {name}, you have {count} messages")
 * // ["name", "count"]
 *
 * @param template - The template string
 * @returns Array of placeholder key names
 */
export const extractPlaceholders = (template: string): readonly string[] => {
  const matches = template.matchAll(/\{(\w+)\}/g);
  return [...matches].map((match) => match[1]).filter((x): x is string =>
    x !== undefined
  );
};
