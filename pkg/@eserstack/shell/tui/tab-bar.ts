// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tab bar widget -- renders a horizontal tab strip with active/inactive
 * styling, optional badges, and overflow truncation.
 *
 * All functions are pure and return strings. No classes, no mutation.
 *
 * @module
 */

import * as ansi from "./ansi.ts";
import * as layoutTypes from "./layout-types.ts";

/** Map a badge colour hint to the corresponding ANSI colour function. */
const badgeColorFn = (
  color: layoutTypes.TabDefinition["badgeColor"],
): (text: string) => string => {
  switch (color) {
    case "green":
      return ansi.green;
    case "yellow":
      return ansi.yellow;
    case "red":
      return ansi.red;
    case "cyan":
      return ansi.cyan;
    case "dim":
      return ansi.dim;
    default:
      return ansi.dim;
  }
};

/**
 * Render a single tab.
 *
 * Format: ` {index+1}:{label} ` with optional ` [{badge}]` suffix.
 * Active styling is determined by the `style` parameter.
 * Inactive tabs are dimmed.
 */
export const renderTab = (
  tab: layoutTypes.TabDefinition,
  index: number,
  isActive: boolean,
  style: "underline" | "inverse" | "bracket" = "inverse",
): string => {
  let inner = ` ${index + 1}:${tab.label} `;

  if (tab.badge !== undefined) {
    const colorFn = badgeColorFn(tab.badgeColor);
    inner += colorFn(`[${tab.badge}]`) + " ";
  }

  if (isActive) {
    switch (style) {
      case "inverse":
        return ansi.inverse(inner);
      case "underline":
        return `\x1b[4m${inner}\x1b[24m`;
      case "bracket":
        return `[${inner}]`;
    }
  }

  return ansi.dim(inner);
};

/**
 * Render the full tab bar as a single-line ANSI string (no trailing newline).
 *
 * Tabs are joined with a dimmed `│` separator. If the total visible width
 * exceeds `maxWidth`, tabs are truncated from the right and a `…` indicator
 * is appended. Remaining space is padded with spaces to fill `maxWidth`.
 */
export const renderTabBar = (props: layoutTypes.TabBarProps): string => {
  const { tabs, activeIndex, maxWidth, style = "inverse" } = props;

  if (tabs.length === 0) {
    return " ".repeat(maxWidth);
  }

  const separator = ansi.dim("\u2502");
  const separatorVisLen = 1; // │ is one visible character

  // Pre-render all tabs so we can measure them
  const rendered: string[] = [];
  const visibleLengths: number[] = [];
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i]!;
    const r = renderTab(tab, i, i === activeIndex, style);
    rendered.push(r);
    visibleLengths.push(ansi.visibleLength(r));
  }

  // Build the bar, truncating if it would exceed maxWidth
  let result = "";
  let usedWidth = 0;
  const ellipsis = "\u2026";
  const ellipsisLen = 1;

  for (let i = 0; i < rendered.length; i++) {
    const tabStr = rendered[i]!;
    const tabVisLen = visibleLengths[i]!;

    // Account for the separator that will precede this tab (except the first)
    const sepCost = i > 0 ? separatorVisLen : 0;
    const totalCost = sepCost + tabVisLen;

    // Check if adding this tab would exceed maxWidth
    // Reserve space for ellipsis if there are more tabs after this one
    const remaining = maxWidth - usedWidth;
    const needsEllipsis = i < rendered.length - 1;
    const reserveForEllipsis = needsEllipsis ? ellipsisLen : 0;

    if (usedWidth + totalCost + reserveForEllipsis > maxWidth) {
      // Does not fit -- append ellipsis if we have room
      if (remaining > 0) {
        result += ellipsis;
        usedWidth += ellipsisLen;
      }
      break;
    }

    if (i > 0) {
      result += separator;
      usedWidth += separatorVisLen;
    }
    result += tabStr;
    usedWidth += tabVisLen;
  }

  // Pad remaining space
  const padding = Math.max(0, maxWidth - usedWidth);
  result += " ".repeat(padding);

  return result;
};

/** Advance to the next tab (wraps around). */
export const nextTab = (activeIndex: number, tabCount: number): number =>
  (activeIndex + 1) % tabCount;

/** Move to the previous tab (wraps around). */
export const prevTab = (activeIndex: number, tabCount: number): number =>
  (activeIndex - 1 + tabCount) % tabCount;
