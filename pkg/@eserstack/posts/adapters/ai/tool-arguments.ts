// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tool-call argument validation for @eserstack/posts.
 *
 * Tool-call arguments are model output, which is untrusted input, and several
 * post tools publish at once with no way back. `validateToolArguments` checks
 * the arguments against the JSON Schema of the tool before any handler runs,
 * and `describeArgumentIssues` turns what it finds into a message that names
 * each bad argument, so the model can correct the call.
 *
 * The checker covers the JSON Schema keywords the post tools use: `type`,
 * `properties`, `required`, `enum`, `items`, `minItems`, `minimum`,
 * `minLength` and `pattern`. It treats every object schema as closed: an
 * argument the schema does not declare is rejected, so a misspelled optional
 * argument (`plaform` for `platform`) cannot fall back to the default
 * platform and publish there.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";

/** The JSON types a tool schema can require. */
export type ToolSchemaType =
  | "object"
  | "array"
  | "string"
  | "integer"
  | "number"
  | "boolean";

/** The subset of JSON Schema that the post tool definitions are written in. */
export type ToolSchema = {
  readonly type?: ToolSchemaType;
  readonly description?: string;
  readonly properties?: Readonly<Record<string, ToolSchema>>;
  readonly required?: readonly string[];
  readonly items?: ToolSchema;
  readonly enum?: readonly unknown[];
  readonly minItems?: number;
  readonly minimum?: number;
  readonly minLength?: number;
  readonly pattern?: string;
};

/**
 * The schema keywords `validateToolArguments` understands. `description` is
 * documentation for the model and checks nothing. A tool definition that uses
 * any other keyword would go unchecked, which a test in tool-arguments.test.ts
 * rules out.
 */
export const SUPPORTED_SCHEMA_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "enum",
  "minItems",
  "minimum",
  "minLength",
  "pattern",
]);

/** One argument that does not match the tool schema. */
export type ToolArgumentIssue = {
  /**
   * Path of the argument, such as `platform` or `texts[1]`; empty when the
   * arguments as a whole are wrong.
   */
  readonly field: string;
  /** What is wrong with it, such as `is required`. */
  readonly problem: string;
};

/**
 * Longest part of a string argument quoted back in an issue; the model only
 * needs enough to recognize the value it sent.
 */
const MAX_QUOTED_LENGTH = 40;

/** Issues listed in one message; the model fixes those and sees the rest next. */
const MAX_REPORTED_ISSUES = 10;

const TYPE_NAMES: Readonly<Record<ToolSchemaType, string>> = {
  object: "an object",
  array: "an array",
  string: "a string",
  integer: "an integer",
  number: "a number",
  boolean: "a boolean",
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

const matchesType = (type: ToolSchemaType, value: unknown): boolean => {
  switch (type) {
    case "object":
      return isRecord(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default: {
      const unreachable: never = type;
      throw new Error(`unhandled schema type ${String(unreachable)}`);
    }
  }
};

/** A short, JSON-escaped rendering of a value for an issue message. */
const describeValue = (value: unknown): string => {
  if (typeof value === "string") {
    const quoted = value.length > MAX_QUOTED_LENGTH
      ? `${value.slice(0, MAX_QUOTED_LENGTH)}...`
      : value;
    return JSON.stringify(quoted);
  }
  if (
    typeof value === "number" || typeof value === "boolean" || value === null
  ) {
    return String(value);
  }
  return Array.isArray(value) ? "an array" : typeof value;
};

const childField = (parent: string, name: string): string =>
  parent === "" ? name : `${parent}.${name}`;

const checkObject = (
  schema: ToolSchema,
  value: Readonly<Record<string, unknown>>,
  field: string,
  issues: ToolArgumentIssue[],
): void => {
  const declared = schema.properties;

  if (schema.required !== undefined) {
    for (const name of schema.required) {
      if (!Object.hasOwn(value, name)) {
        issues.push({ field: childField(field, name), problem: "is required" });
      }
    }
  }

  for (const [name, item] of Object.entries(value)) {
    // Object.hasOwn keeps inherited names such as "constructor" from being
    // looked up as schemas.
    const propertySchema =
      declared !== undefined && Object.hasOwn(declared, name)
        ? declared[name]
        : undefined;

    if (propertySchema === undefined) {
      const names = declared !== undefined ? Object.keys(declared) : [];
      issues.push({
        field: childField(field, name),
        problem: names.length === 0
          ? "is not a parameter of this tool, which takes none"
          : `is not a parameter of this tool; its parameters are ${
            names.join(", ")
          }`,
      });
      continue;
    }

    checkValue(propertySchema, item, childField(field, name), issues);
  }
};

const checkValue = (
  schema: ToolSchema,
  value: unknown,
  field: string,
  issues: ToolArgumentIssue[],
): void => {
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    issues.push({
      field,
      problem: `must be ${TYPE_NAMES[schema.type]}; got ${
        describeValue(value)
      }`,
    });
    return;
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    const allowed = schema.enum.map((option) => JSON.stringify(option));
    issues.push({
      field,
      problem: `must be one of ${allowed.join(", ")}; got ${
        describeValue(value)
      }`,
    });
    return;
  }

  if (typeof value === "string") {
    // JSON Schema counts characters as code points, not UTF-16 units.
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      issues.push({
        field,
        problem: schema.minLength === 1
          ? "must not be empty"
          : `must be at least ${schema.minLength} characters long; got ${
            describeValue(value)
          }`,
      });
    }
    if (
      schema.pattern !== undefined &&
      !new RegExp(schema.pattern, "u").test(value)
    ) {
      issues.push({
        field,
        problem: `must match the pattern ${schema.pattern}; got ${
          describeValue(value)
        }`,
      });
    }
  }

  if (
    typeof value === "number" && schema.minimum !== undefined &&
    value < schema.minimum
  ) {
    issues.push({
      field,
      problem: `must be at least ${schema.minimum}; got ${value}`,
    });
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({
        field,
        problem:
          `must have at least ${schema.minItems} items; got ${value.length}`,
      });
    }
    if (schema.items !== undefined) {
      for (const [index, item] of value.entries()) {
        checkValue(schema.items, item, `${field}[${index}]`, issues);
      }
    }
  }

  if (isRecord(value) && schema.properties !== undefined) {
    checkObject(schema, value, field, issues);
  }
};

/**
 * Check tool-call arguments against the tool's parameter schema.
 *
 * Returns `ok(args)` when every argument matches, so the caller can hand them
 * to the handler, or `fail(issues)` with one entry per bad argument.
 */
export const validateToolArguments = (
  schema: ToolSchema,
  args: unknown,
): results.Result<
  Readonly<Record<string, unknown>>,
  readonly ToolArgumentIssue[]
> => {
  const issues: ToolArgumentIssue[] = [];

  if (!isRecord(args)) {
    issues.push({
      field: "",
      problem: `must be an object; got ${describeValue(args)}`,
    });
    return results.fail(issues);
  }

  checkObject(schema, args, "", issues);
  if (issues.length > 0) return results.fail(issues);
  return results.ok(args);
};

/**
 * The error content returned to the model for arguments that failed
 * validation: which tool did not run, each bad argument by name, and what to
 * do next.
 */
export const describeArgumentIssues = (
  toolName: string,
  issues: readonly ToolArgumentIssue[],
): string => {
  const listed = issues.slice(0, MAX_REPORTED_ISSUES).map((issue) =>
    issue.field === ""
      ? `the arguments ${issue.problem}`
      : `argument "${issue.field}" ${issue.problem}`
  );
  const unlisted = issues.length - listed.length;
  const more = unlisted > 0 ? `; ${unlisted} more not shown` : "";

  return `${toolName} did not run because its arguments do not match the tool schema: ${
    listed.join("; ")
  }${more}. Correct the arguments and call ${toolName} again.`;
};
