// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Codebase command group - validation and management tools
 *
 * Subcommands:
 *   check-circular-deps   Detect circular package dependencies
 *   check-mod-exports     Validate mod.ts exports all files
 *   check-export-names    Validate export naming conventions
 *   check-docs            Validate JSDoc documentation
 *   check-licenses        Validate license headers
 *   check-package-configs Validate deno.json/package.json consistency
 *   versions              Manage workspace versions
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as fmtColors from "@std/fmt/colors";
import * as standardsRuntime from "@eser/standards/runtime";
import * as checkCircularDeps from "@eser/codebase/check-circular-deps";
import * as checkModExports from "@eser/codebase/check-mod-exports";
import * as checkExportNames from "@eser/codebase/check-export-names";
import * as checkDocs from "@eser/codebase/check-docs";
import * as checkLicenses from "@eser/codebase/check-licenses";
import * as checkPackageConfigs from "@eser/codebase/check-package-configs";
import * as versions from "@eser/codebase/versions";

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
  "check-circular-deps": {
    description: "Detect circular package dependencies",
    usage: "eser codebase check-circular-deps [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      console.log("Checking for circular dependencies...\n");

      const result = await checkCircularDeps.checkCircularDeps({ root });

      console.log(`Checked ${result.packagesChecked} packages.`);

      if (result.hasCycles) {
        console.log(
          fmtColors.red(
            `\nFound ${result.cycles.length} circular dependencies:\n`,
          ),
        );
        for (const cycle of result.cycles) {
          console.log(fmtColors.yellow(`  ${cycle.join(" → ")}`));
        }
        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nNo circular dependencies found."));
      }
    },
  },

  "check-mod-exports": {
    description: "Validate mod.ts exports all public files",
    usage: "eser codebase check-mod-exports [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      console.log("Checking mod.ts exports...\n");

      const result = await checkModExports.checkModExports({ root });

      console.log(`Checked ${result.packagesChecked} packages.`);

      if (!result.isComplete) {
        console.log(
          fmtColors.red(
            `\nFound ${result.missingExports.length} missing exports:\n`,
          ),
        );
        for (const missing of result.missingExports) {
          console.log(
            fmtColors.yellow(`  ${missing.packageName}: ${missing.file}`),
          );
        }
        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nAll mod.ts exports are complete."));
      }
    },
  },

  "check-export-names": {
    description: "Validate export naming conventions",
    usage: "eser codebase check-export-names [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      console.log("Checking export naming conventions...\n");

      const result = await checkExportNames.checkExportNames({ root });

      console.log(`Checked ${result.packagesChecked} packages.`);

      if (!result.isValid) {
        console.log(
          fmtColors.red(
            `\nFound ${result.violations.length} naming violations:\n`,
          ),
        );
        for (const violation of result.violations) {
          console.log(fmtColors.yellow(`  ${violation.packageName}:`));
          console.log(`    Export: ${violation.exportPath}`);
          console.log(`    Suggestion: ${violation.suggestion}`);
        }
        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nAll export names follow conventions."));
      }
    },
  },

  "check-docs": {
    description: "Validate JSDoc documentation",
    usage: "eser codebase check-docs [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      console.log("Checking documentation...\n");

      const result = await checkDocs.checkDocs({ root });

      console.log(
        `Checked ${result.filesChecked} files, ${result.symbolsChecked} symbols.`,
      );

      if (!result.isValid) {
        console.log(
          fmtColors.red(
            `\nFound ${result.issues.length} documentation issues:\n`,
          ),
        );

        // Group by file
        const byFile = new Map<string, checkDocs.DocIssue[]>();
        for (const issue of result.issues) {
          const existing = byFile.get(issue.file) ?? [];
          existing.push(issue);
          byFile.set(issue.file, existing);
        }

        for (const [file, fileIssues] of byFile) {
          console.log(fmtColors.yellow(`\n${file}:`));
          for (const issue of fileIssues) {
            const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
            console.log(`  ${issue.symbol}${lineInfo}: ${issue.issue}`);
          }
        }

        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nAll documentation is valid."));
      }
    },
  },

  "check-licenses": {
    description: "Validate license headers in source files",
    usage: "eser codebase check-licenses [options]",
    options: [
      { flag: "--fix", description: "Auto-fix missing or incorrect headers" },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const fix = flags["fix"] as boolean | undefined;
      console.log("Validating license headers...\n");

      const result = await checkLicenses.validateLicenses({ fix });

      if (result.issues.length === 0) {
        console.log(
          `Checked ${result.checked} files. All licenses are valid.`,
        );
        return;
      }

      if (fix) {
        for (const issue of result.issues) {
          if (issue.fixed) {
            console.log(`Fixed ${issue.issue} header: ${issue.path}`);
          }
        }
        console.log(`Fixed ${result.fixedCount} files.`);
      } else {
        for (const issue of result.issues) {
          console.error(
            fmtColors.red(
              `${
                issue.issue === "missing" ? "Missing" : "Incorrect"
              } copyright header: ${issue.path}`,
            ),
          );
        }
        console.log(
          fmtColors.yellow(
            `\nCopyright header should be "// Copyright YYYY-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license."`,
          ),
        );
        standardsRuntime.runtime.process.exit(1);
      }
    },
  },

  "check-package-configs": {
    description: "Validate deno.json and package.json consistency",
    usage: "eser codebase check-package-configs [options]",
    options: [
      {
        flag: "--root <path>",
        description: "Root directory (default: current)",
      },
      { flag: "-h, --help", description: "Show this help message" },
    ],
    handler: async (_args, flags) => {
      const root = flags["root"] as string | undefined;
      console.log("Checking package config consistency...\n");

      const result = await checkPackageConfigs.checkPackageConfigs({ root });

      console.log(`Checked ${result.packagesChecked} packages.`);

      if (!result.isConsistent) {
        console.log(
          fmtColors.red(
            `\nFound ${result.inconsistencies.length} inconsistencies:\n`,
          ),
        );

        // Group by package
        const byPackage = new Map<
          string,
          checkPackageConfigs.ConfigInconsistency[]
        >();
        for (const inc of result.inconsistencies) {
          const existing = byPackage.get(inc.packageName) ?? [];
          existing.push(inc);
          byPackage.set(inc.packageName, existing);
        }

        for (const [pkgName, inconsistencies] of byPackage) {
          console.log(fmtColors.yellow(`${pkgName}:`));
          for (const inc of inconsistencies) {
            console.log(fmtColors.red(`  ⚠ ${inc.field} mismatch:`));
            console.log(`    deno.json:    ${JSON.stringify(inc.denoValue)}`);
            console.log(
              `    package.json: ${JSON.stringify(inc.packageValue)}`,
            );
          }
        }

        standardsRuntime.runtime.process.exit(1);
      } else {
        console.log(fmtColors.green("\nAll package configs are consistent."));
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
  console.log("eser codebase - Codebase validation tools\n");
  console.log("Usage: eser codebase <subcommand> [options]\n");
  console.log("Subcommands:");
  console.log("  check-circular-deps   Detect circular package dependencies");
  console.log("  check-mod-exports     Validate mod.ts exports all files");
  console.log("  check-export-names    Validate export naming conventions");
  console.log("  check-docs            Validate JSDoc documentation");
  console.log("  check-licenses        Validate license headers");
  console.log(
    "  check-package-configs Validate deno.json/package.json consistency",
  );
  console.log("  versions              Manage workspace versions");
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
    boolean: ["help", "dry-run", "fix"],
    string: ["root"],
    alias: { h: "help" },
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
