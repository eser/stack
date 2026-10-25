// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Splitting a spec into child specs. Both split paths use it: answering
 * "split" to `spec <name> next` (commands/next.ts) and `spec <name> split`
 * (commands/spec.ts).
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as machine from "./machine.ts";
import * as persistence from "./persistence.ts";
import * as schema from "./schema.ts";

/** One spec split out of a parent. */
export type ChildSpec = {
  /** Spec name: its directory under .eser/specs/ and its `spec/<name>` branch. */
  readonly name: string;
  /** What the child covers, or null when the split gave no description. */
  readonly description: string | null;
  /** Parent discovery answers the child starts with, attribution included. */
  readonly answers: readonly schema.DiscoveryAnswer[];
};

/**
 * Builds a child spec's state: discovery is complete with the inherited
 * answers, so the child waits in DISCOVERY_REFINEMENT for its review.
 *
 * The answers are copied as they are, not re-added: re-adding stamped every
 * one "Unknown User" with a new timestamp and kept only the last answer per
 * question.
 */
export const buildChildSpecState = (child: ChildSpec): schema.StateFile => {
  const started = machine.startSpec(
    schema.createInitialState(),
    child.name,
    `spec/${child.name}`,
    child.description ?? undefined,
  );

  return machine.completeDiscovery({
    ...started,
    discovery: { ...started.discovery, answers: [...child.answers] },
  });
};

/**
 * A split that cannot go ahead because a child spec name repeats or belongs to
 * a spec that already exists. `names` lists those names; the message tells the
 * user what to change.
 */
export class SplitRefusedError extends Error {
  readonly names: readonly string[];

  constructor(message: string, names: readonly string[]) {
    super(message);
    this.names = names;
    this.name = "SplitRefusedError";
  }
}

const specExists = async (root: string, name: string): Promise<boolean> =>
  await runtime.fs.exists(`${root}/${persistence.paths.specDir(name)}`);

/**
 * Creates one child spec: its directory under .eser/specs/ and its state
 * file.
 *
 * @throws {SplitRefusedError} when a spec with that name already exists, so a
 * split never overwrites another spec's state.
 */
export const createChildSpec = async (
  root: string,
  child: ChildSpec,
): Promise<void> => {
  if (await specExists(root, child.name)) {
    throw new SplitRefusedError(
      `Cannot create spec "${child.name}": a spec with that name already exists.`,
      [child.name],
    );
  }

  await runtime.fs.mkdir(`${root}/${persistence.paths.specDir(child.name)}`, {
    recursive: true,
  });
  await persistence.writeSpecState(
    root,
    child.name,
    buildChildSpecState(child),
  );
};

/**
 * Splits a parent spec: creates every child and returns the parent cancelled
 * with a note that names the children. The caller writes the parent state.
 *
 * Every name is checked before any child is created, so a repeated name or an
 * existing spec leaves nothing half split. `commandPrefix` is how the user
 * runs noskills; the error names the command that picks other names.
 *
 * @throws {SplitRefusedError} when a child name repeats or is already a spec.
 */
export const splitSpec = async (
  root: string,
  parent: schema.StateFile,
  children: readonly ChildSpec[],
  commandPrefix: string,
): Promise<schema.StateFile> => {
  const names = children.map((child) => child.name);
  const quoted = (list: readonly string[]): string =>
    [...new Set(list)].map((name) => `"${name}"`).join(", ");

  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length > 0) {
    throw new SplitRefusedError(
      `Cannot split: child spec names must be unique, and these repeat: ${
        quoted(repeated)
      }.`,
      [...new Set(repeated)],
    );
  }

  const existing = (await Promise.all(
    names.map(async (name) => (await specExists(root, name)) ? name : null),
  )).filter((name): name is string => name !== null);
  if (existing.length > 0) {
    throw new SplitRefusedError(
      `Cannot split: these specs already exist: ${
        quoted(existing)
      }. Choose other names with \`${commandPrefix} spec ${
        parent.spec ?? "<name>"
      } split --into <first> "<description>" --into <second> "<description>"\`.`,
      existing,
    );
  }

  // Each child has its own directory and state file, so they are created
  // concurrently.
  await Promise.all(children.map((child) => createChildSpec(root, child)));

  return machine.completeSpec(
    parent,
    "cancelled",
    `Split into: ${names.join(", ")}`,
  );
};
