// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * New project handler — pure business logic for scaffolding a new
 * project from a registry template.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import * as dependencyResolver from "../dependency-resolver.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";
import * as errorChain from "../error-chain.ts";
import * as ffiClient from "../../ffi-client.ts";

// =============================================================================
// Types
// =============================================================================

/** Which template to use and where to create the project. */
export type NewProjectInput = {
  /** The name of a `"project"`-scale recipe in the registry. */
  readonly templateName: string;
  /** The project's name; it fills the `project_name` variable unless `variables` sets one. */
  readonly projectName: string;
  /** The directory to create the project in; created when missing. */
  readonly targetDir: string;
  /** Path or URL of the registry manifest; the default registry when absent. */
  readonly registrySource?: string;
  /** Without a source, look for a `.eser/recipes.json` in the working directory or a parent first. */
  readonly local?: boolean;
  /** Values for the template's variables by name; they win over the defaults. */
  readonly variables?: Readonly<Record<string, string>>;
  /** Prompt on the terminal for variables that have no value and no default. */
  readonly interactive?: boolean;
  /** Do not run the template's post-install commands. */
  readonly skipPostInstall?: boolean;
};

/**
 * What the new project got. When the native ajan library created it,
 * `template` carries only its name and `depInfo` is empty.
 */
export type NewProjectOutput = {
  /** The template recipe from the registry. */
  readonly template: registrySchema.Recipe;
  /** The files written and the post-install commands that ran. */
  readonly result: recipeApplier.ApplyResult;
  /** The install commands for the template's dependencies, and any warnings. */
  readonly depInfo: dependencyResolver.DependencyInstructions;
};

/**
 * Why the command stopped. `message` renders the whole cause chain for the
 * person running the command; `cause` is the original error, for matching
 * on its type (a RegistryLoadError for RegistryError, a RecipeApplyError
 * or PostInstallError for ApplyError).
 */
export type NewProjectError =
  | {
    readonly _tag: "RegistryError";
    readonly message: string;
    readonly cause: unknown;
  }
  | { readonly _tag: "TemplateNotFound"; readonly message: string }
  | {
    readonly _tag: "ApplyError";
    readonly message: string;
    readonly cause: unknown;
  };

// =============================================================================
// Handler
// =============================================================================

/**
 * Creates a project in `input.targetDir` from a `"project"`-scale registry
 * recipe, overwriting files that are already there, and writes the progress
 * and the next steps to `ctx.out`. Uses the native ajan library when it loads
 * and neither `interactive` nor `skipPostInstall` is set, and the TypeScript
 * applier otherwise.
 *
 * @param input - The template, the project name and directory, and the options
 * @returns A task that resolves to what was created, or fails with a
 *   RegistryError, TemplateNotFound or ApplyError
 */
export const newProject = (
  input: NewProjectInput,
): task.Task<NewProjectOutput, NewProjectError, HandlerContext> =>
  task.task<NewProjectOutput, NewProjectError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
        const canUseFfi = input.interactive !== true &&
          input.skipPostInstall !== true;

        await ffiClient.ensureLib();
        const lib = canUseFfi ? ffiClient.getLib() : null;

        if (lib !== null) {
          const raw = lib.symbols.EserAjanKitNewProject(
            JSON.stringify({
              templateName: input.templateName,
              projectName: input.projectName,
              targetDir: input.targetDir,
              registrySource: input.registrySource,
              variables: input.variables,
            }),
          );
          const goResult = JSON.parse(raw) as {
            recipes?: Array<{
              name: string;
              written: string[];
              skipped: string[];
              total: number;
              postInstallRan: string[];
            }>;
            error?: string;
          };

          if (goResult.error === undefined && goResult.recipes !== undefined) {
            let totalWritten = 0;
            for (const entry of goResult.recipes) {
              totalWritten += entry.written.length;
            }

            ctx.out.writeln(
              span.green(
                `✓ Created ${input.projectName} with ${totalWritten} file(s)`,
              ),
            );

            const mainRecipe = goResult.recipes.find(
              (r) => r.name === input.templateName,
            ) ?? goResult.recipes[0];

            if (mainRecipe !== undefined) {
              for (const file of mainRecipe.written) {
                ctx.out.writeln(`  → ${file}`);
              }
            }

            const fakeTemplate = {
              name: input.templateName,
            } as unknown as registrySchema.Recipe;
            const fakeResult = {
              written: goResult.recipes.flatMap((r) => r.written),
              skipped: goResult.recipes.flatMap((r) => r.skipped ?? []),
              total: goResult.recipes.reduce((s, r) => s + r.total, 0),
              postInstallRan: goResult.recipes.flatMap(
                (r) => r.postInstallRan ?? [],
              ),
            } as unknown as recipeApplier.ApplyResult;
            const fakeDepInfo = {
              instructions: [],
              warnings: [],
            } as unknown as dependencyResolver.DependencyInstructions;

            return results.ok({
              template: fakeTemplate,
              result: fakeResult,
              depInfo: fakeDepInfo,
            });
          }

          // Only the bridge's error for this template means it is absent. Any
          // other error, such as a registry that cannot be read, falls
          // through to the TypeScript path, which reports it with its cause.
          if (
            goResult.error?.startsWith(
              `template '${input.templateName}' not found`,
            ) === true
          ) {
            return results.fail({
              _tag: "TemplateNotFound" as const,
              message: goResult.error,
            });
          }
        }

        const manifest = await registryFetcher.fetchRegistry(
          input.registrySource,
          { local: input.local },
        );

        const templates = manifest.recipes.filter(
          (r) => r.scale === "project",
        );
        const template = templates.find(
          (r) => r.name === input.templateName,
        );

        if (template === undefined) {
          return results.fail({
            _tag: "TemplateNotFound" as const,
            message: `Template '${input.templateName}' not found. Available: ${
              templates.map((t) => t.name).join(", ")
            }`,
          });
        }

        await runtime.fs.mkdir(input.targetDir, {
          recursive: true,
        });

        // Templates reference {{.project_name}}; the key follows the recipe
        // variable naming, not TypeScript's.
        const variables = {
          "project_name": input.projectName,
          ...input.variables,
        };

        const result = await recipeApplier.applyRecipe(template, {
          cwd: input.targetDir,
          registryUrl: manifest.registryUrl,
          force: true,
          variables,
          interactive: input.interactive,
          skipPostInstall: input.skipPostInstall,
        });

        const project = await dependencyResolver.detectProjectType(
          input.targetDir,
        );
        const depInfo = dependencyResolver.getDependencyInstructions(
          template,
          project,
        );

        // Format output
        ctx.out.writeln(
          span.green(
            `✓ Created ${input.projectName} with ${result.written.length} file(s)`,
          ),
        );

        for (const file of result.written) {
          ctx.out.writeln(`  → ${file}`);
        }

        if (depInfo.instructions.length > 0) {
          ctx.out.writeln(span.dim("\nNext steps:"));
          ctx.out.writeln(span.dim(`  cd ${input.projectName}`));
          for (const instruction of depInfo.instructions) {
            ctx.out.writeln(span.dim(`  ${instruction}`));
          }
        }

        return results.ok({ template, result, depInfo });
      } catch (error) {
        const message = errorChain.formatErrorChain(error);
        if (error instanceof registryFetcher.RegistryLoadError) {
          return results.fail({
            _tag: "RegistryError" as const,
            message,
            cause: error,
          });
        }

        return results.fail({
          _tag: "ApplyError" as const,
          message,
          cause: error,
        });
      }
    },
  );
