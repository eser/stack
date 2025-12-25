// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { FormatRegistry, WriterFormat } from "./types.ts";

/**
 * Normalizes a file extension to always start with a dot and be lowercase.
 */
const normalizeExtension = (ext: string): string =>
  ext.toLowerCase().startsWith(".")
    ? ext.toLowerCase()
    : `.${ext.toLowerCase()}`;

class DefaultFormatRegistry implements FormatRegistry {
  private formats = new Map<string, WriterFormat>();

  register(format: WriterFormat): void {
    if (format.name === undefined || format.name.length === 0) {
      throw new Error("Format must have a name");
    }

    if (format.extensions === undefined || format.extensions.length === 0) {
      throw new Error("Format must define at least one extension");
    }

    if (format.serialize?.constructor !== Function) {
      throw new Error("Format must implement serialize function");
    }

    // Register by name
    this.formats.set(format.name.toLowerCase(), format);

    // Register by extensions
    for (const ext of format.extensions) {
      this.formats.set(normalizeExtension(ext), format);
    }
  }

  unregister(name: string): void {
    const format = this.formats.get(name.toLowerCase());
    if (format === undefined) {
      return;
    }

    // Remove by name
    this.formats.delete(format.name.toLowerCase());

    // Remove by extensions
    for (const ext of format.extensions) {
      this.formats.delete(normalizeExtension(ext));
    }
  }

  get(nameOrExtension: string): WriterFormat | undefined {
    const key = nameOrExtension.toLowerCase();
    return this.formats.get(key) ?? this.formats.get(`.${key}`);
  }

  list(): WriterFormat[] {
    const unique = new Map<string, WriterFormat>();

    for (const format of this.formats.values()) {
      unique.set(format.name, format);
    }

    return Array.from(unique.values());
  }

  has(nameOrExtension: string): boolean {
    return this.get(nameOrExtension) !== undefined;
  }

  clear(): void {
    this.formats.clear();
  }
}

export const formatRegistry: FormatRegistry = new DefaultFormatRegistry();

export const registerFormat = (format: WriterFormat): void => {
  formatRegistry.register(format);
};

export const unregisterFormat = (name: string): void => {
  formatRegistry.unregister(name);
};

export const getFormat = (
  nameOrExtension: string,
): WriterFormat | undefined => {
  return formatRegistry.get(nameOrExtension);
};

export const listFormats = (): WriterFormat[] => {
  return formatRegistry.list();
};

export const hasFormat = (nameOrExtension: string): boolean => {
  return formatRegistry.has(nameOrExtension);
};

export const createRegistry = (): FormatRegistry => {
  return new DefaultFormatRegistry();
};
