// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * JSON serialization for log attributes.
 *
 * `JSON.stringify` writes an Error as its own enumerable fields only, and
 * `name`, `message`, `stack` and `cause` are not enumerable, so
 * `logger.with({ error }).warn(...)` used to emit `{"error":{}}`. Every path
 * that turns attributes into JSON (the Go request, the console fallback, the
 * formatters) goes through these helpers instead.
 *
 * @module
 */

/** Written in place of a cause that already appears higher in the chain. */
export const CIRCULAR_CAUSE = "[circular cause]";

/**
 * Converts an Error into a plain object with its name, message, stack, its own
 * enumerable fields (a `code`, a `status`, the ids a domain error carries) and
 * its cause chain, outermost first. An AggregateError also keeps its `errors`.
 * An Error that points back to one that encloses it (through its cause, a
 * field or the `errors` list) is written as {@link CIRCULAR_CAUSE}, so errors
 * that refer to each other do not recurse without end.
 *
 * Error values deeper inside other fields (an array or object field) are left
 * as they are; {@link jsonReplacer} converts them when the object is
 * stringified.
 */
export const serializeError = (error: Error): Record<string, unknown> => {
  // The errors that enclose the one being converted. An error that appears
  // twice side by side is converted twice; only a path back is a cycle.
  const enclosing = new Set<Error>();

  const convertValue = (value: unknown): unknown => {
    if (!(value instanceof Error)) {
      return value;
    }

    if (enclosing.has(value)) {
      return CIRCULAR_CAUSE;
    }

    return convert(value);
  };

  const convert = (current: Error): Record<string, unknown> => {
    enclosing.add(current);

    const json: Record<string, unknown> = {
      name: current.name,
      message: current.message,
    };

    for (const [key, value] of Object.entries(current)) {
      json[key] = convertValue(value);
    }

    json["stack"] = current.stack;

    if (current instanceof AggregateError) {
      json["errors"] = Array.isArray(current.errors)
        ? current.errors.map(convertValue)
        : current.errors;
    }

    const cause: unknown = current.cause;
    if (cause !== undefined) {
      json["cause"] = convertValue(cause);
    }

    enclosing.delete(current);

    return json;
  };

  return convert(error);
};

/**
 * `JSON.stringify` replacer that writes every Error value through
 * {@link serializeError}, wherever it sits in the value.
 */
export const jsonReplacer = (_key: string, value: unknown): unknown =>
  value instanceof Error ? serializeError(value) : value;

/**
 * Stringifies a value with {@link jsonReplacer}. Returns null instead of
 * throwing when the value cannot be serialized (a cycle, a BigInt): attributes
 * come from callers, and a log call must not fail over what it was asked to
 * log.
 */
export const toJson = (value: unknown): string | null => {
  try {
    return JSON.stringify(value, jsonReplacer);
  } catch {
    return null;
  }
};
