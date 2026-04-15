// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module — composable CLI module definition.
 *
 * A Module owns its registry of lazy-loaded entries and can be:
 * - Used standalone via `module.toCommand("name").parse()`
 * - Composed into another CLI via `parent.addSubmodule({ name }, child)`
 *
 * @example
 * ```typescript
 * import { Module } from "@eserstack/shell/module";
 *
 * // Define a module
 * const mod = new Module({
 *   description: "My tool",
 *   modules: {
 *     init: { description: "Initialize", load: () => import("./init.ts") },
 *   },
 * });
 *
 * // Standalone CLI
 * await mod.toCommand("mytool", "1.0.0").parse();
 *
 * // Or compose into a parent
 * parentModule.addSubmodule({ name: "mytool", aliases: ["mt"] }, mod);
 * ```
 *
 * @module
 */

import type { GroupOptions, ModuleEntry } from "./args/types.ts";
import { Command } from "./args/command.ts";

/**
 * Configuration for creating a Module.
 */
export type ModuleConfig = {
  /** Description shown in help text */
  readonly description: string;
  /** Lazy-loaded module entries */
  readonly modules?: Readonly<Record<string, ModuleEntry>>;
  /** Aliases mapping alias names to module names */
  readonly aliases?: Readonly<Record<string, string>>;
};

/**
 * Configuration for registering a submodule.
 */
export type SubmoduleRegistration = {
  /** Primary name for the submodule namespace */
  readonly name: string;
  /** Additional names that route to the same submodule */
  readonly aliases?: readonly string[];
};

/**
 * A composable CLI module that owns its registry and can be deployed
 * standalone or embedded as a submodule in another CLI.
 */
export class Module {
  readonly description: string;
  readonly #modules: Readonly<Record<string, ModuleEntry>>;
  readonly #aliases: Readonly<Record<string, string>>;
  readonly #submodules: Array<
    { registration: SubmoduleRegistration; module: Module }
  > = [];

  constructor(config: ModuleConfig) {
    this.description = config.description;
    this.#modules = config.modules ?? {};
    this.#aliases = config.aliases ?? {};
  }

  /**
   * Register another Module as a namespaced submodule.
   * When this module runs as CLI, the submodule appears as a command group.
   */
  addSubmodule(registration: SubmoduleRegistration, module: Module): this {
    this.#submodules.push({ registration, module });
    return this;
  }

  /**
   * Register a submodule from an async factory.
   * Resolves the factory immediately and registers the resulting Module.
   */
  async addSubmoduleAsync(
    registration: SubmoduleRegistration,
    factory: Promise<Module>,
  ): Promise<this> {
    const module = await factory;
    this.#submodules.push({ registration, module });
    return this;
  }

  /**
   * Convert to GroupOptions for use with Command.group().
   * This is the bridge between the Module abstraction and the Command framework.
   */
  toGroupOptions(): GroupOptions {
    return {
      description: this.description,
      modules: this.#modules,
      aliases: Object.keys(this.#aliases).length > 0
        ? this.#aliases
        : undefined,
    };
  }

  /**
   * Create a standalone Command from this module.
   *
   * - Own modules are registered for flat dispatch (e.g., `noskills init`)
   * - Submodules are registered as module groups (e.g., `eser noskills init`)
   */
  toCommand(name: string, version?: string): Command {
    const cmd = new Command(name).description(this.description);

    if (version !== undefined) {
      cmd.version(version);
    }

    // Own modules → flat dispatch via .modules()
    if (Object.keys(this.#modules).length > 0) {
      cmd.modules(this.toGroupOptions());
    }

    // Submodules → namespaced dispatch via .group()
    for (const { registration, module: submod } of this.#submodules) {
      const opts = submod.toGroupOptions();
      cmd.group(registration.name, opts);

      if (registration.aliases !== undefined) {
        for (const alias of registration.aliases) {
          cmd.groupAlias(alias, registration.name, opts);
        }
      }
    }

    return cmd;
  }
}
