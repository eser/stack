#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run
// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { parseArgs } from "@std/cli/parse-args";
import { generate } from "./generate.ts";
import { sync } from "./sync.ts";
import type { KubectlResourceReference, SyncOptions } from "./types.ts";

const VERSION = "0.1.0";

interface CliOptions {
  config?: string;
  name?: string;
  namespace?: string;
  envFile?: string;
  format?: "yaml" | "json";
  output?: string;
  help?: boolean;
  version?: boolean;
}

const HELP_TEXT = `
@eser/cs - Kubernetes ConfigMap/Secret Sync Tool

USAGE:
  deno run -A jsr:@eser/cs/cli [COMMAND] [OPTIONS]

COMMANDS:
  generate    Generate ConfigMap/Secret YAML/JSON from .env files (default)
  sync        Sync with existing Kubernetes resource (e.g., cm/default, secret/default)

OPTIONS:
  -c, --config <path>     Path to config file (k8s.yaml, k8s.json, etc.)
      --name <name>       ConfigMap/Secret name (required for generate)
  -n, --namespace <ns>    Kubernetes namespace
  -e, --env-file <path>   Path to environment file (.env)
  -f, --format <format>   Output format (yaml/json) [default: yaml]
  -o, --output <path>     Output file path (default: stdout)
  -h, --help             Show this help message
  -v, --version          Show version information

EXAMPLES:
  # Generate ConfigMap from .env file
  deno run -A jsr:@eser/cs/cli generate --name my-config --env-file .env

  # Generate Secret with specific namespace and JSON format
  deno run -A jsr:@eser/cs/cli generate --name my-secret -n production --env-file .env.prod --format json

  # Save to file
  deno run -A jsr:@eser/cs/cli generate --name my-config --env-file .env --output configmap.yaml

  # Sync with existing Kubernetes ConfigMap
  deno run -A jsr:@eser/cs/cli sync cm/default -n cp-development

  # Sync with existing Kubernetes Secret
  deno run -A jsr:@eser/cs/cli sync secret/default -n production --format json
`;

function showHelp(): void {
  console.log(HELP_TEXT);
}

function showVersion(): void {
  console.log(`@eser/cs v${VERSION}`);
}

async function writeOutput(
  content: string,
  outputPath?: string,
): Promise<void> {
  if (outputPath !== undefined) {
    try {
      await Deno.writeTextFile(outputPath, content);
      console.error(`✓ Output written to ${outputPath}`);
    } catch (error) {
      console.error(
        `Error writing to ${outputPath}:`,
        error instanceof Error ? error.message : String(error),
      );
      Deno.exit(1);
    }
  } else {
    console.log(content);
  }
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
    string: ["config", "name", "namespace", "env-file", "format", "output"],
    boolean: ["help", "version"],
    alias: {
      c: "config",
      n: "namespace",
      e: "env-file",
      f: "format",
      o: "output",
      h: "help",
      v: "version",
    },
  });

  const command = args._.length > 0 ? String(args._[0]) : "generate";
  let kubectlResource: KubectlResourceReference | undefined;

  // For sync command, parse the second argument as resource reference
  if (command === "sync" && args._.length > 1) {
    const resourceArg = String(args._[1]);
    kubectlResource = parseKubectlResource(resourceArg) || undefined;
  }

  const options: CliOptions = {
    config: args.config,
    name: args.name,
    namespace: args.namespace,
    envFile: args["env-file"],
    format: args.format as "yaml" | "json" | undefined,
    output: args.output,
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
  // Validate format
  if (
    options.format !== undefined && options.format !== "yaml" &&
    options.format !== "json"
  ) {
    console.error("Error: format must be 'yaml' or 'json'");
    Deno.exit(1);
  }

  // Validate required options for specific commands
  if (command === "generate") {
    if (options.name === undefined) {
      console.error(`Error: --name is required for '${command}' command`);
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

async function handleGenerate(options: CliOptions): Promise<void> {
  try {
    const result = await generate({
      configPath: options.config,
      format: options.format ?? "yaml",
      name: options.name,
      namespace: options.namespace,
      envFile: options.envFile,
    });

    await writeOutput(result, options.output);
  } catch (error) {
    console.error(
      "Error generating ConfigMap:",
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
      format: options.format ?? "yaml",
      output: options.output,
    };

    const result = await sync(kubectlOptions);
    await writeOutput(result, options.output);
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
      await handleGenerate(options);
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
