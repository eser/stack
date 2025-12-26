// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command class - Cobra-like CLI framework
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as standardsRuntime from "@eser/standards/runtime";
import type {
  ArgsConfig,
  ArgsValidation,
  CommandContext,
  CommandHandler,
  CommandLike,
  FlagDef,
} from "./types.ts";
import {
  buildParseOptions,
  extractFlags,
  validateRequiredFlags,
} from "./flags.ts";
import { generateHelp, type HelpCommandMeta } from "./help.ts";
import { generate as generateCompletions } from "../completions/mod.ts";
import type {
  CompletionFlag,
  CompletionNode,
  Shell,
} from "../completions/types.ts";

/**
 * Command represents a CLI command or subcommand with flags and handlers
 */
export class Command implements CommandLike {
  readonly #name: string;
  #description?: string;
  #usage?: string;
  #examples: string[] = [];
  #aliases: string[] = [];
  #flags: FlagDef[] = [];
  #persistentFlags: FlagDef[] = [];
  #children: Command[] = [];
  #handler?: CommandHandler;
  #argsConfig: ArgsConfig = { validation: "none" };
  #version?: string;
  #parent?: Command;

  constructor(name: string) {
    this.#name = name;
  }

  /** Get the command name */
  get name(): string {
    return this.#name;
  }

  /** Set command description */
  description(text: string): this {
    this.#description = text;
    return this;
  }

  /** Set custom usage string */
  usage(text: string): this {
    this.#usage = text;
    return this;
  }

  /** Add usage example */
  example(text: string): this {
    this.#examples.push(text);
    return this;
  }

  /** Set command aliases */
  aliases(...names: string[]): this {
    this.#aliases = names;
    return this;
  }

  /** Set version (for root command) */
  version(v: string): this {
    this.#version = v;
    return this;
  }

  /** Add a local flag (only available to this command) */
  flag(def: FlagDef): this {
    this.#flags.push(def);
    return this;
  }

  /** Add a persistent flag (available to this command and all subcommands) */
  persistentFlag(def: Omit<FlagDef, "persistent">): this {
    this.#persistentFlags.push({ ...def, persistent: true });
    return this;
  }

  /** Configure argument validation */
  args(
    validation: ArgsValidation,
    count?: number | [number, number],
  ): this {
    if (validation === "exact" && typeof count === "number") {
      this.#argsConfig = { validation, count };
    } else if (validation === "min" && typeof count === "number") {
      this.#argsConfig = { validation, min: count };
    } else if (validation === "max" && typeof count === "number") {
      this.#argsConfig = { validation, max: count };
    } else if (validation === "range" && Array.isArray(count)) {
      this.#argsConfig = { validation, min: count[0], max: count[1] };
    } else {
      this.#argsConfig = { validation };
    }
    return this;
  }

  /** Add a single subcommand */
  command(child: Command): this {
    child.#parent = this;
    this.#children.push(child);
    return this;
  }

  /** Add multiple subcommands */
  commands(...children: Command[]): this {
    for (const child of children) {
      this.command(child);
    }
    return this;
  }

  /** Set the command handler */
  run(handler: CommandHandler): this {
    this.#handler = handler;
    return this;
  }

  /** Built-in flags available to all commands */
  static readonly #builtInFlags: FlagDef[] = [
    {
      name: "help",
      short: "h",
      type: "boolean",
      description: "Show help for this command",
    },
  ];

  /** Get all flags including inherited persistent flags and built-in flags */
  #getAllFlags(): FlagDef[] {
    const inherited: FlagDef[] = [];
    let current: Command | undefined = this.#parent;
    while (current !== undefined) {
      inherited.push(...current.#persistentFlags);
      current = current.#parent;
    }
    return [
      ...Command.#builtInFlags,
      ...inherited,
      ...this.#persistentFlags,
      ...this.#flags,
    ];
  }

  /** Get the root command */
  #getRoot(): Command {
    if (this.#parent === undefined) {
      return this;
    }
    return this.#parent.#getRoot();
  }

  /** Get the command path from root */
  #getPath(): string[] {
    if (this.#parent === undefined) {
      return [this.#name];
    }
    return [...this.#parent.#getPath(), this.#name];
  }

  /** Find a child command by name or alias */
  #findChild(name: string): Command | undefined {
    return this.#children.find(
      (c) => c.#name === name || c.#aliases.includes(name),
    );
  }

  /** Validate argument count */
  #validateArgs(args: readonly string[]): string | undefined {
    const { validation, count, min, max } = this.#argsConfig;
    const len = args.length;

    switch (validation) {
      case "no-args":
        if (len > 0) return `This command takes no arguments`;
        break;
      case "exact":
        if (len !== count) {
          return `Expected exactly ${count} argument(s), got ${len}`;
        }
        break;
      case "min":
        if (len < (min ?? 0)) {
          return `Expected at least ${min} argument(s), got ${len}`;
        }
        break;
      case "max":
        if (len > (max ?? Infinity)) {
          return `Expected at most ${max} argument(s), got ${len}`;
        }
        break;
      case "range":
        if (len < (min ?? 0) || len > (max ?? Infinity)) {
          return `Expected ${min}-${max} arguments, got ${len}`;
        }
        break;
    }
    return undefined;
  }

  /** Parse and execute the command */
  async parse(argv?: readonly string[]): Promise<void> {
    const inputArgs = argv ?? standardsRuntime.runtime.process.args;
    await this.#execute(inputArgs as string[], []);
  }

  async #execute(
    argv: string[],
    parentPath: string[],
  ): Promise<void> {
    const allFlags = this.#getAllFlags();
    const parseOptions = buildParseOptions(allFlags);

    const parsed = cliParseArgs.parseArgs(argv, {
      ...parseOptions,
      stopEarly: this.#children.length > 0,
    });

    const flags = extractFlags(parsed, allFlags);
    const positional = parsed._ as string[];

    // Handle --version at root
    if (this.#version !== undefined && flags["version"] === true) {
      // deno-lint-ignore no-console
      console.log(`${this.#name} ${this.#version}`);
      return;
    }

    // Handle --help
    if (flags["help"] === true) {
      // deno-lint-ignore no-console
      console.log(this.help());
      return;
    }

    // Check for subcommand
    const firstArg = positional[0];
    if (firstArg !== undefined && this.#children.length > 0) {
      const child = this.#findChild(firstArg);

      if (child !== undefined) {
        await child.#execute(positional.slice(1), [...parentPath, this.#name]);
        return;
      }
    }

    // No handler means show help
    if (this.#handler === undefined) {
      // deno-lint-ignore no-console
      console.log(this.help());
      return;
    }

    // Validate required flags
    const flagErrors = validateRequiredFlags(flags, allFlags);
    if (flagErrors.length > 0) {
      // deno-lint-ignore no-console
      console.error(flagErrors.join("\n"));
      standardsRuntime.runtime.process.exit(1);
    }

    // Validate args
    const argsError = this.#validateArgs(positional);
    if (argsError !== undefined) {
      // deno-lint-ignore no-console
      console.error(argsError);
      standardsRuntime.runtime.process.exit(1);
    }

    // Build context and run handler
    const commandPath = [...parentPath, this.#name];
    const ctx: CommandContext = {
      args: positional,
      flags,
      root: this.#getRoot(),
      commandPath,
    };

    await this.#handler(ctx);
  }

  /** Generate help text */
  help(): string {
    const meta: HelpCommandMeta = {
      name: this.#name,
      description: this.#description,
      usage: this.#usage,
      examples: this.#examples,
      flags: this.#getAllFlags(),
      children: this.#children.map((c) => ({
        name: c.#name,
        description: c.#description,
        usage: c.#usage,
        examples: c.#examples,
        flags: c.#getAllFlags(),
        children: [],
      })),
    };
    return generateHelp(meta, this.#getPath());
  }

  /** Build completion tree from command structure */
  #buildCompletionTree(): CompletionNode {
    const flagsToCompletionFlags = (
      flags: readonly FlagDef[],
    ): CompletionFlag[] => {
      return flags.map((f) => ({
        name: f.name,
        short: f.short,
        description: f.description,
        takesValue: f.type !== "boolean",
      }));
    };

    const buildNode = (cmd: Command): CompletionNode => ({
      name: cmd.#name,
      description: cmd.#description,
      children: cmd.#children.map(buildNode),
      flags: flagsToCompletionFlags(cmd.#getAllFlags()),
    });

    return buildNode(this);
  }

  /** Generate shell completion script */
  completions(shell: Shell): string {
    const tree = this.#buildCompletionTree();
    return generateCompletions(shell, this.#name, tree);
  }
}
