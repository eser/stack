#!/usr/bin/env -S node
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This CLI prints manifests and kubectl commands on stdout for piping and
// eval, and its errors and warnings on stderr, so it writes through console.
/* oxlint-disable no-console */

import * as shellFlags from "@eserstack/shell/args/flags";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as shellArgs from "@eserstack/shell/args";
import * as generate from "./generate.ts";
import * as sync from "./sync.ts";
import type { KubectlResourceReference, SyncOptions } from "./types.ts";

const VERSION = "0.1.0";

/** The options of the cs CLI. */
export interface CliOptions {
  namespace?: string;
  env?: string;
  output?: "yaml" | "json";
  stringOnly?: boolean;
  help?: boolean;
  version?: boolean;
}

const HELP_TEXT = `
@eserstack/cs - Kubernetes ConfigMap/Secret Sync Tool

USAGE:
  eser cs [COMMAND] [OPTIONS]
  node cli.ts [COMMAND] [OPTIONS]   (from this package; same commands)

COMMANDS:
  generate    Generate ConfigMap/Secret YAML/JSON from .env files (requires -e flag)
              Usage: generate [cm|configmap|secret]/name -e <env-name>
  sync        Generate kubectl patch commands to sync with existing Kubernetes resources
              Usage: sync [cm|configmap|secret]/name [-e <env-name>]

OPTIONS:
  -e, --env <name>                Environment name
  -n, --namespace <ns>            Kubernetes namespace
  -o, --output <format>           Output format (yaml/json) [default: json]
  -s, --string-only               Output only patch string (no kubectl command)
  -h, --help                      Show this help message
  -v, --version                   Show version information

EXAMPLES:
  # Generate ConfigMap from environment
  eser cs generate cm/my-config -e development

  # Generate Secret and save to file
  eser cs generate secret/api-keys -n production -e production > secret.yaml

  # Generate kubectl patch command for ConfigMap (JSON format)
  eser cs sync cm/default -n development -e development

  # Generate YAML format patch command
  eser cs sync cm/default -n development -e development -o yaml

  # Output only patch string for saving to file
  eser cs sync secret/default -e development -s > patch.json

  # Execute sync command directly
  eval "$(eser cs sync secret/default -n development -e development)"
`;

function showHelp(): void {
  console.log(HELP_TEXT);
}

function showVersion(): void {
  console.log(`@eserstack/cs v${VERSION}`);
}

function parseKubectlResource(
  resourceArg: string,
): KubectlResourceReference | null {
  const parts = resourceArg.split("/");
  if (parts.length !== 2) {
    return null;
  }

  const [typeStr, name] = parts;
  let type: "configmap" | "secret";

  if (typeStr === "cm" || typeStr === "configmap") {
    type = "configmap";
  } else if (typeStr === "secret") {
    type = "secret";
  } else {
    return null;
  }

  if (name === undefined) {
    return null;
  }

  return { type, name };
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * Parse the cs arguments: the command, its resource, `--namespace` (`-n`),
 * `--env` (`-e`), `--output` (`-o`), `--string-only` (`-s`), `--help` (`-h`)
 * and `--version` (`-v`).
 */
export function parseCliArgs(cliArgs: readonly string[]): {
  command: string | undefined;
  options: CliOptions;
  kubectlResource?: KubectlResourceReference;
} {
  const { values, positionals } = shellFlags.parseArgs(cliArgs, {
    options: {
      namespace: { type: "string", short: "n" },
      env: { type: "string", short: "e" },
      output: { type: "string", short: "o" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      "string-only": { type: "boolean", short: "s" },
    },
  });

  const command = positionals[0];
  let kubectlResource: KubectlResourceReference | undefined;

  // For sync and generate commands, parse the second argument as resource reference
  const resourceArg = positionals[1];
  if (
    (command === "sync" || command === "generate") &&
    resourceArg !== undefined
  ) {
    kubectlResource = parseKubectlResource(resourceArg) ?? undefined;
  }

  const options: CliOptions = {
    namespace: stringValue(values["namespace"]),
    env: stringValue(values["env"]),
    output: stringValue(values["output"]) as "yaml" | "json" | undefined,
    stringOnly: values["string-only"] === true,
    help: values["help"] === true,
    version: values["version"] === true,
  };

  return { command, options, kubectlResource };
}

function validateOptions(
  command: string | undefined,
  options: CliOptions,
  kubectlResource?: KubectlResourceReference,
): shellArgs.CliResult<KubectlResourceReference> {
  // Validate output format
  if (![undefined, "yaml", "json"].includes(options.output)) {
    return results.fail({
      message: "Error: output format must be 'yaml' or 'json'",
      exitCode: 1,
    });
  }

  // Validate required options for specific commands
  if (command === "generate" || command === "sync") {
    if (kubectlResource === undefined) {
      return results.fail({
        message: `Error: ${command} command requires a resource (e.g., cm/default, secret/default)`,
        exitCode: 1,
      });
    }
  }

  // For commands that require a resource, we've validated it exists above
  return results.ok(
    undefined,
  ) as unknown as shellArgs.CliResult<KubectlResourceReference>;
}

async function handleGenerate(
  options: CliOptions,
  kubectlResource: KubectlResourceReference,
): Promise<shellArgs.CliResult<void>> {
  try {
    const result = await generate.generate({
      format: options.output ?? "yaml",
      resource: kubectlResource,
      namespace: options.namespace,
      env: options.env,
    });

    console.log(result);
    return results.ok(undefined);
  } catch (error) {
    return results.fail({
      message: `Error generating resource: ${
        error instanceof Error ? error.message : String(error)
      }`,
      exitCode: 1,
    });
  }
}

async function handleSync(
  options: CliOptions,
  kubectlResource: KubectlResourceReference,
): Promise<shellArgs.CliResult<void>> {
  try {
    const kubectlOptions: SyncOptions = {
      resource: {
        type: kubectlResource.type,
        name: kubectlResource.name,
        namespace: options.namespace,
      },
      env: options.env,
      format: options.output,
      stringOnly: options.stringOnly,
      onMissingKey: (key) => {
        console.warn(
          `Warning: ${key} is in ${kubectlResource.type}/${kubectlResource.name} but not in the environment, so the patch leaves it out; define it in the .env file to sync it.`,
        );
      },
    };

    const result = await sync.sync(kubectlOptions);
    console.log(result);
    return results.ok(undefined);
  } catch (error) {
    return results.fail({
      message: `Error syncing with kubectl: ${
        error instanceof Error ? error.message : String(error)
      }`,
      exitCode: 1,
    });
  }
}

async function main(): Promise<shellArgs.CliResult<void>> {
  const { command, options, kubectlResource } = parseCliArgs(
    runtime.process.args,
  );

  // Handle help and version flags
  if (options.version === true) {
    showVersion();
    return results.ok(undefined);
  }

  if (options.help === true || command === undefined) {
    showHelp();
    return results.ok(undefined);
  }

  // Validate options
  const validationResult = validateOptions(command, options, kubectlResource);
  if (results.isFail(validationResult)) {
    return validationResult;
  }

  // Handle commands
  switch (command) {
    case "generate":
      return await handleGenerate(options, kubectlResource!);

    case "sync":
      return await handleSync(options, kubectlResource!);

    default:
      return results.fail({
        message: `Unknown command: ${command}`,
        exitCode: 1,
      });
  }
}

// Run the CLI if this file is executed directly
if (import.meta.main) {
  // CLI entry point: runs only when executed directly, never on import.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
}
