// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { isAlphanumeric } from "../checks/is-alphanumeric.ts";
import { isNumeric } from "../checks/is-numeric.ts";
import { isWhitespace } from "../checks/is-whitespace.ts";
import { type TokenDefinitions } from "./definition.ts";

export const simpleTokens: TokenDefinitions = {
  T_NEWLINE: "\n",
  T_DOT: ".",
  T_COMMA: ",",
  T_COLON: ":",
  T_SEMICOLON: ";",
  T_PARENTHESIS_OPEN: "(",
  T_PARENTHESIS_CLOSE: ")",
  T_SQUARE_BRACKET_OPEN: "[",
  T_SQUARE_BRACKET_CLOSE: "]",
  T_CURLY_BRACKET_OPEN: "{",
  T_CURLY_BRACKET_CLOSE: "}",
  T_UNDERSCORE: "_",
  T_QUESTION_MARK: "?",
  T_AT: "@",
  T_PLUS: "+",
  T_HYPHEN: "-",
  T_ASTERISK: "*",
  T_SLASH: "/",
  T_PERCENT: "%",
  T_AMPERSAND: "&",
  T_HASH: "#",
  T_PIPE: "|",
  T_TILDE: "~",
  T_CARET: "^",
  T_IS_SMALLER: "<",
  T_IS_GREATER: ">",
  T_EQUALS: "=",
  T_EXCLAMATION_MARK: "!",
  T_BACKSLASH: "\\",
  T_DOUBLE_QUOTE: '"',
  T_QUOTE: "'",
  T_BACKTICK: "`",
  T_DOLLAR_SIGN: "$",
  T_WHITESPACE: isWhitespace,
  T_NUMERIC: isNumeric,
  T_ALPHANUMERIC: isAlphanumeric,
  T_UNKNOWN: null,
  T_END: null,
};
