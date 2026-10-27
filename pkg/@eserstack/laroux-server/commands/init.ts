// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux init command
 *
 * Creates a new laroux.js project from a project recipe of a kit registry,
 * the same recipes `eser kit new` scaffolds. Without `--registry` it reads
 * eser/stack's registry on GitHub, the default registry of kit.
 *
 * @module
 */

import * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as results from "@eserstack/primitives/results";
import * as task from "@eserstack/functions/task";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as registryFetcher from "@eserstack/kit/recipes/fetcher";
import * as newProjectHandler from "@eserstack/kit/recipes/handlers/new-project";

/**
 * The templates `laroux init --template` accepts, each with the name of the
 * kit recipe it scaffolds.
 */
export const TEMPLATE_RECIPES: Readonly<Record<string, string>> = {
  minimal: "laroux-app",
};

/** The folder init creates the project in when none is given. */
export const DEFAULT_FOLDER = "my-laroux-app";

const DEFAULT_TEMPLATE = "minimal";

const FLAGS: readonly shellArgs.FlagDef[] = [
  {
    name: "template",
    short: "t",
    type: "string",
    default: DEFAULT_TEMPLATE,
    description: `Project template (${Object.keys(TEMPLATE_RECIPES).join(", ")})`,
  },
  {
    name: "registry",
    type: "string",
    description:
      "Path or URL of a kit recipes.json (default: eser/stack's registry on GitHub)",
  },
  {
    name: "force",
    short: "f",
    type: "boolean",
    description: "Write the template over a folder that is not empty",
  },
  {
    name: "no-git",
    type: "boolean",
    description: "Skip the template's post-install commands, as --no-install",
  },
  {
    name: "no-install",
    type: "boolean",
    description: "Skip the template's post-install commands",
  },
  { name: "help", short: "h", type: "boolean", description: "Show this help" },
];

type CliResult = results.Result<void, { message?: string; exitCode: number }>;

/** What one `laroux init` run creates, and from where. */
type InitOptions = {
  /** The project folder as given, relative to `cwd` or absolute. */
  readonly folder: string;
  readonly template: string;
  readonly cwd: string;
  /** Path or URL of the registry manifest. */
  readonly registrySource: string;
  readonly force: boolean;
  readonly skipPostInstall: boolean;
};

/**
 * The help text of `laroux init`.
 *
 * @returns The usage line, the options and examples
 */
export const helpText = (): string =>
  shellArgs.generateHelp(
    {
      name: "init",
      description: "Create a new laroux.js project from a kit recipe",
      usage: "laroux init [folder] [options]",
      flags: FLAGS,
      children: [],
      examples: [
        "laroux init my-app",
        "laroux init my-app --registry ./.eser/recipes.json --no-install",
      ],
    },
    ["laroux", "init"],
  );

/**
 * The topmost directory of `path` and its parents that does not exist yet,
 * which is what creating `path` creates; null when `path` exists.
 */
const firstMissingAncestor = async (path: string): Promise<string | null> => {
  let missing: string | null = null;
  let dir = path;

  // Each check decides whether the parent is checked next, so they run in
  // order, from the project folder up.
  // oxlint-disable-next-line no-await-in-loop
  while (!(await runtime.fs.exists(dir))) {
    missing = dir;
    const parent = runtime.path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return missing;
};

const isEmptyDir = async (dir: string): Promise<boolean> => {
  for await (const _entry of runtime.fs.readDir(dir)) {
    return false;
  }

  return true;
};

/**
 * Remove the directory init created for a project whose scaffolding failed.
 *
 * @returns A line for the failure message: what was removed, or what to
 *   remove by hand
 */
const removeCreated = async (created: string): Promise<string> => {
  try {
    await runtime.fs.remove(created, { recursive: true });
    return `Removed ${created}, which laroux init created.`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return `Could not remove ${created}, which laroux init created (${reason}); remove it by hand.`;
  }
};

const runInit = async (
  options: InitOptions,
  out: streams.Output,
  renderer: streams.Renderer,
): Promise<CliResult> => {
  const fail = (lines: readonly string[]): CliResult =>
    results.fail({
      message: renderer.render([span.red(`\n${lines.join("\n")}`)]),
      exitCode: 1,
    });

  const recipeName = Object.hasOwn(TEMPLATE_RECIPES, options.template)
    ? TEMPLATE_RECIPES[options.template]
    : undefined;

  if (recipeName === undefined) {
    return fail([
      `laroux init: no template named "${options.template}".`,
      `Available templates: ${Object.keys(TEMPLATE_RECIPES).join(", ")}`,
    ]);
  }

  const targetDir = runtime.path.resolve(options.cwd, options.folder);
  const projectName = runtime.path.basename(targetDir);
  const created = await firstMissingAncestor(targetDir);

  if (created === null) {
    const info = await runtime.fs.stat(targetDir);
    if (!info.isDirectory) {
      return fail([
        `laroux init: ${options.folder} exists and is not a directory; choose another folder.`,
      ]);
    }

    if (!options.force && !(await isEmptyDir(targetDir))) {
      return fail([
        `laroux init: ${options.folder} is not empty; pass --force to write the template over its files.`,
      ]);
    }
  }

  out.writeln(
    span.cyan(`\n✨ Creating new laroux.js project in ${options.folder}\n`),
  );
  out.writeln(
    span.dim(`   Template: ${options.template} (recipe ${recipeName})`),
  );
  out.writeln(span.dim(`   Registry: ${options.registrySource}\n`));

  const handlerResult = await task
    .runTask(
      newProjectHandler.newProject({
        templateName: recipeName,
        projectName,
        targetDir,
        registrySource: options.registrySource,
        variables: { project_name: projectName },
        // The TypeScript applier reads the files of a registry on disk from
        // its directory; the native one still reads them from its
        // registryUrl (TASK-362). It prompts only for a variable without a
        // value, and project_name has one.
        interactive: true,
        skipPostInstall: options.skipPostInstall,
      }),
      { out },
    )
    .catch(async (error: unknown) => {
      if (created !== null) {
        await removeCreated(created);
      }
      throw error;
    });

  if (results.isFail(handlerResult)) {
    // The handler's message names the failed step and its whole cause chain,
    // so it is printed without a prefix.
    const lines = [handlerResult.error.message];
    if (created !== null) {
      lines.push(await removeCreated(created));
    }

    return fail(lines);
  }

  out.writeln(span.green(`\n🎉 Project created successfully!`));

  out.writeln();
  out.writeln(span.bold("Start the development server:"));
  out.writeln();
  out.writeln(span.text(`  cd ${options.folder}`));
  out.writeln(span.text("  npm install"));
  out.writeln(span.text("  npm run dev"));
  out.writeln();
  out.writeln(
    span.text("Then open "),
    span.cyan("http://localhost:8000"),
    span.text(" in your browser."),
  );
  out.writeln();
  out.writeln(span.dim("Learn more at https://laroux.now/"));
  out.writeln();

  return results.ok(undefined);
};

/**
 * Run `laroux init [folder] [options]`: scaffold the template's kit recipe
 * into `folder` (default `my-laroux-app`) under the working directory. A
 * failed run removes the folder when it created it.
 *
 * @param args - The arguments after `init`
 * @returns ok when the project was created or the help was printed;
 *   otherwise the message to print and exit code 1
 */
export const main = async (args?: readonly string[]): Promise<CliResult> => {
  const { positional, flags } = shellArgs.parseFlags(args ?? [], FLAGS);

  const renderer = streams.renderers.ansi();
  const out = streams.output({
    renderer,
    sink: streams.sinks.stdout(),
  });

  try {
    if (flags["help"] === true) {
      out.writeln(helpText());
      return results.ok(undefined);
    }

    return await runInit(
      {
        folder: positional[0] ?? DEFAULT_FOLDER,
        template: (flags["template"] as string | undefined) ?? DEFAULT_TEMPLATE,
        cwd: runtime.process.cwd(),
        registrySource:
          (flags["registry"] as string | undefined) ??
          registryFetcher.DEFAULT_REGISTRY_URL,
        force: flags["force"] === true,
        skipPostInstall:
          flags["no-install"] === true || flags["no-git"] === true,
      },
      out,
      renderer,
    );
  } finally {
    await out.close();
  }
};
