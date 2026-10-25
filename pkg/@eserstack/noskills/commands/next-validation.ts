// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The validator step of `noskills next`.
 *
 * At the end of discovery and at the spec proposal, runs a second agent on the
 * transition when `--validate` or the manifest's `validate` entry asks for it.
 * The result is stored per spec, so later `next` calls on the same input repeat
 * it instead of calling the agent again.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";
import type * as compiler from "../context/compiler.ts";
import * as transitionValidation from "../context/transition-validation.ts";
import * as cmd from "../output/cmd.ts";

/** The `next` flag that runs the validator on this call. */
export const VALIDATE_FLAG = "--validate";

/** What the validator step needs from `next`. */
export type NextValidationDeps = {
  readonly resolveFactory: transitionValidation.FactoryResolver;
  readonly timeoutMs: number;
  /** Tells the user the validator is running, on stderr: stdout is the JSON. */
  readonly notify: (text: string) => Promise<void>;
};

/**
 * The provider lookup `noskills run` uses. `@eserstack/ai/adapters` loads
 * every vendor SDK, so it is imported on the first validator call instead of
 * on every `next`.
 */
export const resolveAiFactory: transitionValidation.FactoryResolver = async (
  agent,
) => {
  const adapters = await import("@eserstack/ai/adapters");

  return await adapters.factoryFor(agent);
};

/**
 * Adds the validation to the output and points the phase instruction at it,
 * so an agent that follows only `instruction` still presents the findings
 * before it asks for approval.
 */
export const attachValidation = (
  output: compiler.NextOutput,
  validation: transitionValidation.TransitionValidation,
): compiler.NextOutput => {
  const instruction: unknown = (output as { instruction?: unknown })
    .instruction;
  if (typeof instruction !== "string") return { ...output, validation };

  return {
    ...output,
    instruction:
      `${instruction} A second agent checked this transition: follow \`validation.instruction\` before you ask the user for approval.`,
    validation,
  } as compiler.NextOutput;
};

/** The stored record: the last result and the key of the input it judged. */
type StoredValidation = {
  readonly key: string;
  readonly validation: transitionValidation.TransitionValidation;
};

/**
 * Returns the validation to add to the `next` output, or null when nobody
 * asked for one or the state is at no validated transition.
 *
 * `forced` (`--validate`) runs the validator every time. Turned on by the
 * manifest, it runs once per input: the stored result is repeated while the
 * spec, the answers, the transition and the agent stay the same.
 */
export const validationFor = async (
  root: string,
  state: schema.StateFile,
  config: schema.NosManifest,
  forced: boolean,
  deps: NextValidationDeps,
): Promise<transitionValidation.TransitionValidation | null> => {
  if (!forced && !transitionValidation.manifestRequestsValidation(config)) {
    return null;
  }

  const transition = transitionValidation.transitionToValidate(state);
  if (transition === null || state.spec === null) {
    if (forced) {
      await deps.notify(
        `noskills: ${VALIDATE_FLAG} has nothing to check in ${state.phase}; the validator runs at the end of discovery and at the spec proposal, before the approval.`,
      );
    }

    return null;
  }

  const spec = state.spec;
  const retryCommand = cmd.cmd(`spec ${spec} next ${VALIDATE_FLAG}`);
  const settings = transitionValidation.validatorSettingsOf(config.validate);
  if (results.isFail(settings)) {
    return transitionValidation.skippedValidation(
      transition,
      null,
      settings.error,
      retryCommand,
    );
  }

  const skip = (reason: string): transitionValidation.SkippedValidation =>
    transitionValidation.skippedValidation(
      transition,
      settings.value,
      reason,
      retryCommand,
    );

  const specDocument = await readSpecDocument(
    root,
    state.specState.path ?? persistence.paths.specFile(spec),
  );
  if (results.isFail(specDocument)) return skip(specDocument.error);

  const input = transitionValidation.validationInputOf(
    state,
    transition,
    specDocument.value,
  );
  const key = await transitionValidation.validationKeyOf(
    input,
    settings.value,
  );

  if (!forced) {
    const stored = storedValidationOf(
      await persistence.readValidationRecord(root, spec),
    );
    if (stored !== null && stored.key === key) return stored.validation;
  }

  await deps.notify(
    `noskills: ${settings.value.agent} (${settings.value.model}) is checking the ${transition.id} transition; this can take up to ${
      deps.timeoutMs / 1000
    } seconds.`,
  );

  const validation = await runInEmptyDirectory(
    (workDir) =>
      transitionValidation.runValidator(input, settings.value, {
        resolveFactory: deps.resolveFactory,
        timeoutMs: deps.timeoutMs,
        workDir,
        retryCommand,
      }),
    skip,
  );

  try {
    await persistence.writeValidationRecord(root, spec, { key, validation });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await deps.notify(
      `noskills: the validator result was not stored in ${
        persistence.paths.validationFile(spec)
      }, so the next call runs the validator again: ${detail}`,
    );
  }

  return validation;
};

/** Whether a relative path stays inside its base once "." and ".." apply. */
const insideProject = (relative: string): boolean => {
  let depth = 0;
  for (const segment of relative.split(/[/\\]/)) {
    if (segment === "" || segment === ".") continue;
    depth += segment === ".." ? -1 : 1;
    if (depth < 0) return false;
  }

  return true;
};

/**
 * Reads the spec document the validator sees. No document yet is null; a
 * document that exists but cannot be read fails with the reason, because
 * judging the spec without it would mislead.
 */
const readSpecDocument = async (
  root: string,
  relative: string,
): Promise<results.Result<string | null, string>> => {
  // The path comes from state.json, so it is held to the project, by its
  // segments and, through symlinks, by where it really points; the document
  // goes to a model.
  const leaves = `${relative} could not be read: the path leaves the project.`;
  if (
    relative.startsWith("/") || /^[A-Za-z]:/.test(relative) ||
    !insideProject(relative)
  ) {
    return results.fail(leaves);
  }

  try {
    const [realRoot, realFile] = await Promise.all([
      runtime.fs.realPath(root),
      runtime.fs.realPath(`${root}/${relative}`),
    ]);
    if (realFile !== realRoot && !realFile.startsWith(`${realRoot}/`)) {
      return results.fail(leaves);
    }

    return results.ok(await runtime.fs.readTextFile(realFile));
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) return results.ok(null);

    const detail = error instanceof Error ? error.message : String(error);

    return results.fail(`${relative} could not be read: ${detail}.`);
  }
};

/**
 * Runs `work` with a new empty directory, so a CLI agent started there finds
 * none of the project's files, rules or hooks, and removes the directory
 * afterwards.
 */
const runInEmptyDirectory = async (
  work: (
    workDir: string,
  ) => Promise<transitionValidation.TransitionValidation>,
  skip: (reason: string) => transitionValidation.SkippedValidation,
): Promise<transitionValidation.TransitionValidation> => {
  let workDir: string;
  try {
    workDir = await runtime.fs.makeTempDir({ prefix: "noskills-validator-" });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);

    return skip(
      `no empty directory could be created for the validator: ${detail}.`,
    );
  }

  try {
    return await work(workDir);
  } finally {
    try {
      await runtime.fs.remove(workDir, { recursive: true });
    } catch {
      // A temporary directory left behind is harmless; the result stands.
    }
  }
};

/** Checks a stored record's shape; anything else counts as no record. */
const storedValidationOf = (record: unknown): StoredValidation | null => {
  if (record === null || typeof record !== "object") return null;

  const candidate = record as Record<string, unknown>;
  const validation = candidate["validation"];
  if (
    typeof candidate["key"] !== "string" ||
    validation === null || typeof validation !== "object"
  ) {
    return null;
  }

  const status = (validation as Record<string, unknown>)["status"];
  if (status !== "reviewed" && status !== "skipped") return null;

  return record as StoredValidation;
};
