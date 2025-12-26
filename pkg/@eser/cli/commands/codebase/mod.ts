// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codebase command group - validation and management tools
 *
 * Subcommands:
 *   init      Initialize project from template
 *   validate  Run all applicable codebase validations
 *   versions  Manage workspace versions
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as validation from "@eser/codebase/validation";
import * as versions from "@eser/codebase/versions";
import * as scaffolding from "@eser/codebase/scaffolding";

type SubcommandDef = {
  description: string;
  usage: string;
  options: Array<{ flag: string; description: string }>;
  handler: (args: string[], flags: Record<string, unknown>) => Promise<void>;
};

const showSubcommandHelp = (name: string, def: SubcommandDef): void => {
  console.log(`eser codebase ${name} - ${def.description}\n`);
  console.log(`Usage: ${def.usage}\n`);
  if (def.options.length > 0) {
    console.log("Options:");
    for (const opt of def.options) {
      console.log(`  ${opt.flag.padEnd(20)} ${opt.description}`);
    }
  }
};

const subcommands: Record<string, SubcommandDef> = {
  init: {
    description: "Initialize project from template",
    usage: "eser codebase init <specifier> [options]",
    options: [
      {
        flag: "-p, --path <dir>",
        description: "Target directory (default: current)",
      },
      { flag: "-f, --force", description: "Overwrite existing files" },
      {
        flag: "--var <name=value>",
        description: "Set template variable (can be used multiple times)",
      },
      {
        flag: "--skip-post-install",
        description: "Skip post-install commands",
      },
      {
        flag: "-i, --interactive",
        description: "Prompt for missing variables",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (args, flags) => {
      const specifier = args[0];

      if (specifier === undefined) {
        console.error(fmtColors.red("Error: Template specifier is required"));
        console.log("\nUsage: eser codebase init <specifier> [options]");
        console.log("\nExamples:");
        console.log("  eser codebase init eser/ajan");
        console.log("  eser codebase init gh:eser/ajan#v1.0");
        console.log("  eser codebase init eser/ajan -p ./my-project");
        standardsRuntime.runtime.process.exit(1);
        return;
      }

      const targetDir = (flags["path"] as string | undefined) ?? ".";
      const force = flags["force"] as boolean | undefined ?? false;
      const skipPostInstall =
        flags["skip-post-install"] as boolean | undefined ?? false;
      const interactive = flags["interactive"] as boolean | undefined ?? false;

      // Parse --var flags into variables object
      const varFlags = flags["var"];
      const variables: Record<string, string> = {};

      if (typeof varFlags === "string") {
        const [key, ...valueParts] = varFlags.split("=");
        if (key !== undefined) {
          variables[key] = valueParts.join("=");
        }
      } else if (Array.isArray(varFlags)) {
        for (const v of varFlags) {
          const [key, ...valueParts] = String(v).split("=");
          if (key !== undefined) {
            variables[key] = valueParts.join("=");
          }
        }
      }

      console.log(`Scaffolding from ${fmtColors.cyan(specifier)}...`);

      try {
        const result = await scaffolding.scaffold({
          specifier,
          targetDir,
          variables,
          force,
          skipPostInstall,
          interactive,
        });

        console.log(
          fmtColors.green(
            `\nScaffolded ${result.templateName} to ${result.targetDir}`,
          ),
        );

        if (Object.keys(result.variables).length > 0) {
          console.log("\nVariables applied:");
          for (const [key, value] of Object.entries(result.variables)) {
            console.log(`  ${fmtColors.dim(key)}: ${value}`);
          }
        }

        if (result.postInstallCommands.length > 0) {
          console.log("\nPost-install commands executed:");
          for (const cmd of result.postInstallCommands) {
            console.log(`  ${fmtColors.dim(cmd)}`);
          }
        }
      } catch (error) {
        console.error(
          fmtColors.red(`\nScaffolding failed: ${(error as Error).message}`),
        );
        standardsRuntime.runtime.process.exit(1);
      }
    },
  },

  validate: {
    description: "Run all applicable codebase validations",
    usage: "eser codebase validate [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      {
        flag: "--only <validators>",
        description: "Run only specific validators (comma-separated)",
      },
      {
        flag: "--skip <validators>",
        description: "Skip specific validators (comma-separated)",
      },
      { flag: "--fix", description: "Auto-fix issues where supported" },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      const fix = flags["fix"] as boolean | undefined;

      // Parse comma-separated validator lists
      const onlyRaw = flags["only"] as string | undefined;
      const skipRaw = flags["skip"] as string | undefined;
      const only = onlyRaw !== undefined
        ? onlyRaw.split(",").map((s) => s.trim())
        : undefined;
      const skip = skipRaw !== undefined
        ? skipRaw.split(",").map((s) => s.trim())
        : undefined;

      // Load project config to show stack info
      const config = await validation.loadProjectConfig(root ?? ".");
      const stackInfo = config?.stack?.join(", ") ?? "all (no .eser.yml)";

      console.log("Validating codebase...\n");
      console.log(`Stack: ${fmtColors.cyan(stackInfo)}\n`);

      const result = await validation.validate({ root, only, skip, fix });

      // Print results
      for (const validatorResult of result.results) {
        const status = validatorResult.passed
          ? fmtColors.green("PASS")
          : fmtColors.red("FAIL");

        const stats = Object.entries(validatorResult.stats)
          .map(([key, value]) => `${value} ${key}`)
          .join(", ");

        console.log(
          `  ${validatorResult.name.padEnd(18)} ${status}  (${stats})`,
        );
      }

      // Print skipped validators
      if (result.skipped.length > 0) {
        console.log(fmtColors.dim("\nSkipped (stack not configured):"));
        for (const skipped of result.skipped) {
          console.log(fmtColors.dim(`  - ${skipped.name}: ${skipped.reason}`));
        }
      }

      // Print disabled validators
      if (result.disabled.length > 0) {
        console.log(fmtColors.dim("\nDisabled:"));
        for (const disabled of result.disabled) {
          console.log(fmtColors.dim(`  - ${disabled}`));
        }
      }

      // Print issues grouped by location (file or validator)
      const allIssues = result.results.flatMap((r) =>
        r.issues.map((i) => ({ validator: r.name, ...i }))
      );

      if (allIssues.length > 0) {
        console.log(fmtColors.red(`\nIssues (${allIssues.length}):\n`));

        // Group issues by location (file path or validator name)
        const grouped = new Map<string, typeof allIssues>();
        for (const issue of allIssues) {
          const location = issue.file ?? issue.validator;
          const existing = grouped.get(location) ?? [];
          existing.push(issue);
          grouped.set(location, existing);
        }

        for (const [location, issues] of grouped) {
          console.log(`  ${fmtColors.dim(location)}`);
          for (const issue of issues) {
            const severity = issue.severity === "error"
              ? fmtColors.red("error")
              : fmtColors.yellow("warning");
            const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
            console.log(`    ${severity}${lineInfo}: ${issue.message}`);
          }
          console.log();
        }
      }

      // Summary
      const failedCount = result.results.filter((r) => !r.passed).length;
      if (failedCount > 0) {
        console.log(
          fmtColors.red(
            `\n${failedCount} check(s) failed with ${allIssues.length} issue(s)`,
          ),
        );
        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nAll checks passed!"));
      }
    },
  },

  versions: {
    description: "Manage workspace package versions",
    usage: "eser codebase versions [command] [options]",
    options: [
      { flag: "sync", description: "Sync all packages to root version" },
      { flag: "patch", description: "Bump patch version (0.0.x)" },
      { flag: "minor", description: "Bump minor version (0.x.0)" },
      { flag: "major", description: "Bump major version (x.0.0)" },
      { flag: "--dry-run", description: "Preview changes without applying" },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (args, flags) => {
      const command = args[0] as versions.VersionCommand | undefined;
      const dryRun = flags["dry-run"] as boolean | undefined;

      if (command === undefined) {
        const result = await versions.showVersions();
        console.table(result.packages);
        return;
      }

      const validCommands = ["sync", "patch", "minor", "major"];
      if (!validCommands.includes(command)) {
        console.error(fmtColors.red(`Invalid command: ${command}`));
        console.error(
          "Usage: eser codebase versions [sync|patch|minor|major] [--dry-run]",
        );
        standardsRuntime.runtime.process.exit(1);
      }

      if (command === "sync") {
        console.log("Syncing all versions...");
      } else {
        console.log(`Bumping all versions (${command})...`);
      }

      const result = await versions.versions(command, { dryRun });

      console.log(`Target version: ${result.targetVersion}`);
      console.table(result.updates);

      if (result.dryRun) {
        console.log(
          fmtColors.cyan(
            `Dry run - ${result.changedCount} packages would be modified.`,
          ),
        );
      } else {
        console.log(`Done. Updated ${result.changedCount} packages.`);
      }
    },
  },
};

const showHelp = (): void => {
  console.log("eser codebase - Codebase management tools\n");
  console.log("Usage: eser codebase <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  init      Initialize project from template");
  console.log("  validate  Run all applicable codebase validations");
  console.log("  versions  Manage workspace versions");
  console.log(
    "\nRun 'eser codebase <subcommand> --help' for subcommand options.",
  );
};

export const codebaseCommand = async (
  rawArgs: string[],
  _parentFlags: Record<string, unknown>,
): Promise<void> => {
  // Parse all flags (don't use stopEarly so --help is always captured)
  const parsed = cliParseArgs.parseArgs(rawArgs, {
    boolean: [
      "help",
      "dry-run",
      "fix",
      "force",
      "interactive",
      "skip-post-install",
    ],
    string: ["root", "path", "var", "only", "skip"],
    alias: { h: "help", p: "path", f: "force", i: "interactive" },
    collect: ["var"],
  });

  const subcommand = parsed._[0] as string | undefined;

  // Show main help if no subcommand or help without subcommand
  if (subcommand === undefined) {
    showHelp();
    return;
  }

  const def = subcommands[subcommand];
  if (def === undefined) {
    console.error(fmtColors.red(`Unknown subcommand: ${subcommand}`));
    console.log("");
    showHelp();
    standardsRuntime.runtime.process.exit(1);
  }

  // Show subcommand help if --help flag
  if (parsed.help) {
    showSubcommandHelp(subcommand, def);
    return;
  }

  await def.handler(parsed._.slice(1) as string[], parsed);
};
