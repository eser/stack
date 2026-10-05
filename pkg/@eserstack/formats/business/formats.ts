// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type FormatEncodeOptions = {
  readonly pretty?: boolean;
  readonly indent?: number;
  readonly isFirst?: boolean;
  /**
   * Writes the value as a whole document instead of one list entry: one YAML
   * mapping instead of a sequence entry, one TOML table without a `+++` line,
   * one JSON value without array separators.
   */
  readonly document?: boolean;
};

export type FormatEncodeDocumentOptions = {
  readonly pretty?: boolean;
  readonly indent?: number;
};

export type FormatListItem = {
  readonly name: string;
  readonly extensions: string[];
  readonly streamable: boolean;
};

export type Loader = {
  encode(
    format: string,
    data: unknown,
    opts?: FormatEncodeOptions,
  ): Promise<string>;
  encodeDocument(
    format: string,
    items: unknown[],
    opts?: FormatEncodeDocumentOptions,
  ): Promise<string>;
  decode(format: string, text: string): Promise<unknown[]>;
  list(): Promise<FormatListItem[]>;
};

export const encodeWith = (
  loader: Loader,
  format: string,
  data: unknown,
  opts?: FormatEncodeOptions,
): Promise<string> => loader.encode(format, data, opts);

export const encodeDocumentWith = (
  loader: Loader,
  format: string,
  items: unknown[],
  opts?: FormatEncodeDocumentOptions,
): Promise<string> => loader.encodeDocument(format, items, opts);

export const decodeWith = (
  loader: Loader,
  format: string,
  text: string,
): Promise<unknown[]> => loader.decode(format, text);

export const listFormatsWith = (
  loader: Loader,
): Promise<FormatListItem[]> => loader.list();
