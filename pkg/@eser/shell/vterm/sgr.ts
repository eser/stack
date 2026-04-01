// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * SGR (Select Graphic Rendition) parser — maps ANSI style codes to TextStyle.
 * @module
 */

export type RGB = { r: number; g: number; b: number };

export type TextStyle = {
  fg: number; // -1 = default, 0-7 = standard, 8-15 = bright, 16-255 = 256-color
  bg: number; // same
  fgRGB: RGB | null; // truecolor fg (overrides fg when set)
  bgRGB: RGB | null; // truecolor bg (overrides bg when set)
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
};

export const defaultStyle = (): TextStyle => ({
  fg: -1,
  bg: -1,
  fgRGB: null,
  bgRGB: null,
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
});

export const parseSGR = (
  params: readonly number[],
  current: TextStyle,
): TextStyle => {
  const style = { ...current };
  let i = 0;

  while (i < params.length) {
    const p = params[i]!;

    switch (p) {
      case 0: // Reset
        Object.assign(style, defaultStyle());
        break;
      case 1:
        style.bold = true;
        break;
      case 2:
        style.dim = true;
        break;
      case 3:
        style.italic = true;
        break;
      case 4:
        style.underline = true;
        break;
      case 7:
        style.inverse = true;
        break;
      case 22:
        style.bold = false;
        style.dim = false;
        break;
      case 23:
        style.italic = false;
        break;
      case 24:
        style.underline = false;
        break;
      case 27:
        style.inverse = false;
        break;

      // Standard foreground 30-37
      case 30:
      case 31:
      case 32:
      case 33:
      case 34:
      case 35:
      case 36:
      case 37:
        style.fg = p - 30;
        break;
      case 39:
        style.fg = -1;
        break;

      // Standard background 40-47
      // Default fg
      case 40:
      case 41:
      case 42:
      case 43:
      case 44:
      case 45:
      case 46:
      case 47:
        style.bg = p - 40;
        break;
      case 49:
        style.bg = -1;
        break;

      // Bright foreground 90-97
      // Default bg
      case 90:
      case 91:
      case 92:
      case 93:
      case 94:
      case 95:
      case 96:
      case 97:
        style.fg = p - 90 + 8;
        break;

      // Bright background 100-107
      case 100:
      case 101:
      case 102:
      case 103:
      case 104:
      case 105:
      case 106:
      case 107:
        style.bg = p - 100 + 8;
        break;

      // Extended color: 38;5;n (256-color fg) or 38;2;r;g;b (truecolor fg)
      case 38:
        if (
          i + 1 < params.length && params[i + 1] === 5 &&
          i + 2 < params.length
        ) {
          style.fg = params[i + 2]!;
          style.fgRGB = null;
          i += 2;
        } else if (
          i + 1 < params.length && params[i + 1] === 2 &&
          i + 4 < params.length
        ) {
          style.fgRGB = {
            r: params[i + 2]!,
            g: params[i + 3]!,
            b: params[i + 4]!,
          };
          style.fg = -1;
          i += 4;
        }
        break;

      // Extended color: 48;5;n (256-color bg) or 48;2;r;g;b (truecolor bg)
      case 48:
        if (
          i + 1 < params.length && params[i + 1] === 5 &&
          i + 2 < params.length
        ) {
          style.bg = params[i + 2]!;
          style.bgRGB = null;
          i += 2;
        } else if (
          i + 1 < params.length && params[i + 1] === 2 &&
          i + 4 < params.length
        ) {
          style.bgRGB = {
            r: params[i + 2]!,
            g: params[i + 3]!,
            b: params[i + 4]!,
          };
          style.bg = -1;
          i += 4;
        }
        break;
    }

    i++;
  }

  return style;
};
