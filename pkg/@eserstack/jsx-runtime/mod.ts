// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// @ts-types="@types/react/jsx-runtime"
import * as reactJsxRuntime from "react/jsx-runtime";
import { encodeEntities } from "./encoder.ts";

export const jsx = reactJsxRuntime.jsx;
export const jsxs = reactJsxRuntime.jsxs;
export const Fragment = reactJsxRuntime.Fragment;

// deno-lint-ignore no-explicit-any
type VNode = object | any[]; // reactJsxRuntime.JSX.Element;

/**
 * Escape a dynamic child passed to `jsxTemplate`. This function
 * is not expected to be used directly, but rather through a
 * precompile JSX transform
 */
export function jsxEscape(value: unknown): string | null | VNode {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    typeof value === "function"
  ) {
    return null;
  }

  if (typeof value === "object") {
    // Check for VNode
    if (value.constructor === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        value[i] = jsxEscape(value[i]);
      }

      return value;
    }
  }

  return encodeEntities(String(value));
}

/**
 * Create a template vnode. This function is not expected to be
 * used directly, but rather through a precompile JSX transform
 */
export const jsxTemplate = (
  templates: string[],
  ...exprs: ReadonlyArray<string | null | VNode>
): VNode => {
  const vnode = jsx(reactJsxRuntime.Fragment, { tpl: templates, exprs });

  return vnode;
};
