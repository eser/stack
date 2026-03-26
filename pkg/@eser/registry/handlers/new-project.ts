// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * New project handler — pure business logic for scaffolding a new
 * project from a registry template.
 *
 * @module
 */

import * as task from "@eser/functions/task";
import * as results from "@eser/primitives/results";
import * as span from "@eser/streams/span";
import * as registryFetcher from "../registry-fetcher.ts";
import * as recipeApplier from "../recipe-applier.ts";
import * as dependencyResolver from "../dependency-resolver.ts";
import type * as registrySchema from "../registry-schema.ts";
import type { HandlerContext } from "../handler-context.ts";

// =============================================================================
// Types
// =============================================================================

type NewProjectInput = {
  readonly templateName: string;
  readonly projectName: string;
  readonly targetDir: string;
  readonly registrySource?: string;
  readonly local?: boolean;
  readonly variables?: Readonly<Record<string, string>>;
};

type NewProjectOutput = {
  readonly template: registrySchema.Recipe;
  readonly result: recipeApplier.ApplyResult;
  readonly depInfo: dependencyResolver.DependencyInstructions;
};

type NewProjectError =
  | { readonly _tag: "RegistryError"; readonly message: string }
  | { readonly _tag: "TemplateNotFound"; readonly message: string }
  | { readonly _tag: "ApplyError"; readonly message: string };

// =============================================================================
// Handler
// =============================================================================

const newProject = (
  input: NewProjectInput,
): task.Task<NewProjectOutput, NewProjectError, HandlerContext> =>
  task.task<NewProjectOutput, NewProjectError, HandlerContext>(
    async (ctx: HandlerContext) => {
      try {
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

        await Deno.mkdir(input.targetDir, { recursive: true });

        const variables = {
          project_name: input.projectName,
          ...input.variables,
        };

        const result = await recipeApplier.applyRecipe(template, {
          cwd: input.targetDir,
          registryUrl: manifest.registryUrl,
          force: true,
          variables,
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
        const msg = error instanceof Error ? error.message : String(error);
        return results.fail({ _tag: "ApplyError" as const, message: msg });
      }
    },
  );

export { newProject };

export type { NewProjectError, NewProjectInput, NewProjectOutput };
