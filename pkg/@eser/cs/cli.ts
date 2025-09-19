#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { parseArgs } from "@std/cli/parse-args";
import { generate } from "./generate.ts";
import { sync } from "./sync.ts";
import type { KubectlResourceReference, SyncOptions } from "./types.ts";

const VERSION = "0.1.0";

interface CliOptions {
  namespace?: string;
  envFile?: string;
  output?: "yaml" | "json";
  stringOnly?: boolean;
  help?: boolean;
  version?: boolean;
}

const HELP_TEXT = `
@eser/cs - Kubernetes ConfigMap/Secret Sync Tool

USAGE:
  deno run -A jsr:@eser/cs/cli [COMMAND] [OPTIONS]

COMMANDS:
  generate    Generate ConfigMap/Secret YAML/JSON from .env files (requires -f flag)
              Usage: generate [cm|configmap|secret]/name -f <env-file>
  sync        Generate kubectl patch commands to sync with existing Kubernetes resources
              Usage: sync [cm|configmap|secret]/name [-f <env-file>]

OPTIONS:
  -n, --namespace <ns>            Kubernetes namespace
  -f, --reference-env-file <path> Path to environment file (required for generate, optional for sync)
  -o, --output <format>           Output format (yaml/json) [default: json]
  -s, --string-only               Output only patch string (no kubectl command)
  -h, --help                      Show this help message
  -v, --version                   Show version information

EXAMPLES:
  # Generate ConfigMap from .env file
  deno run -A jsr:@eser/cs/cli generate cm/my-config -f .env

  # Generate Secret and save to file
  deno run -A jsr:@eser/cs/cli generate secret/api-keys -n production -f .env.prod > secret.yaml

  # Generate kubectl patch command for ConfigMap (JSON format)
  deno run -A jsr:@eser/cs/cli sync cm/default -n development -f .env.dev

  # Generate YAML format patch command
  deno run -A jsr:@eser/cs/cli sync cm/default -n development -f .env.dev -o yaml

  # Output only patch string for saving to file
  deno run -A jsr:@eser/cs/cli sync secret/default -f .env.dev -s > patch.json

  # Execute sync command directly
  eval "$(deno run -A jsr:@eser/cs/cli sync secret/default -n development -f .env.dev)"
`;

function showHelp(): void {
  console.log(HELP_TEXT);
}

function showVersion(): void {
  console.log(`@eser/cs v${VERSION}`);
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

function parseCliArgs(): {
  command: string;
  options: CliOptions;
  kubectlResource?: KubectlResourceReference;
} {
  const args = parseArgs(Deno.args, {
    string: ["namespace", "reference-env-file", "output"],
    boolean: ["help", "version", "string-only"],
    alias: {
      n: "namespace",
      f: "reference-env-file",
      o: "output",
      s: "string-only",
      h: "help",
      v: "version",
    },
  });

  const command = args._.length > 0 ? String(args._[0]) : "generate";
  let kubectlResource: KubectlResourceReference | undefined;

  // For sync and generate commands, parse the second argument as resource reference
  if ((command === "sync" || command === "generate") && args._.length > 1) {
    const resourceArg = String(args._[1]);
    kubectlResource = parseKubectlResource(resourceArg) ?? undefined;
  }

  const options: CliOptions = {
    namespace: args.namespace,
    envFile: args["reference-env-file"],
    output: args.output as "yaml" | "json" | undefined,
    stringOnly: args["string-only"],
    help: args.help,
    version: args.version,
  };

  return { command, options, kubectlResource };
}

function validateOptions(
  command: string,
  options: CliOptions,
  kubectlResource?: KubectlResourceReference,
): void {
  // Validate output format
  if (
    options.output !== undefined && options.output !== "yaml" &&
    options.output !== "json"
  ) {
    console.error("Error: output format must be 'yaml' or 'json'");
    Deno.exit(1);
  }

  // Validate required options for specific commands
  if (command === "generate") {
    if (kubectlResource === undefined) {
      console.error(
        `Error: generate command requires a resource (e.g., cm/default, secret/default)`,
      );
      Deno.exit(1);
    }
  }

  // Validate sync command
  if (command === "sync") {
    if (kubectlResource === undefined) {
      console.error(
        "Error: sync command requires a resource (e.g., cm/default, secret/default)",
      );
      Deno.exit(1);
    }
  }
}

async function handleGenerate(
  options: CliOptions,
  kubectlResource: KubectlResourceReference,
): Promise<void> {
  try {
    const result = await generate({
      format: options.output ?? "yaml",
      resource: kubectlResource,
      namespace: options.namespace,
      envFile: options.envFile,
    });

    console.log(result);
  } catch (error) {
    console.error(
      "Error generating resource:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

async function handleSync(
  options: CliOptions,
  kubectlResource: KubectlResourceReference,
): Promise<void> {
  try {
    const kubectlOptions: SyncOptions = {
      resource: {
        type: kubectlResource.type,
        name: kubectlResource.name,
        namespace: options.namespace,
      },
      envFile: options.envFile,
      format: options.output,
      stringOnly: options.stringOnly,
    };

    const result = await sync(kubectlOptions);
    console.log(result);
  } catch (error) {
    console.error(
      "Error syncing with kubectl:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
}

async function main(): Promise<void> {
  const { command, options, kubectlResource } = parseCliArgs();

  // Handle help and version flags
  if (options.help === true) {
    showHelp();
    return;
  }

  if (options.version === true) {
    showVersion();
    return;
  }

  // Validate options
  validateOptions(command, options, kubectlResource);

  // Handle commands
  switch (command) {
    case "generate":
      if (kubectlResource === undefined) {
        console.error("Error: generate resource not specified");
        Deno.exit(1);
      }
      await handleGenerate(options, kubectlResource);
      break;
    case "sync":
      if (kubectlResource === undefined) {
        console.error("Error: sync resource not specified");
        Deno.exit(1);
      }
      await handleSync(options, kubectlResource);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'deno task cli --help' for usage information.");
      Deno.exit(1);
  }
}

// Run the CLI if this file is executed directly
if (import.meta.main) {
  await main();
}
