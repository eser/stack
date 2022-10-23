import {
  type Command,
  CommandType,
  execute,
  ExecuteOptions,
  showHelp,
  showVersion,
} from "./src/cli/mod.ts";
import { create } from "./src/generator/create.ts";

const VERSION = "0.0.1";

const upgradeCli = async (args: string[], options: ExecuteOptions) => {
  const p = Deno.run({
    cmd: ["deno", "install", "-A", "-r", "-f", "https://deno.land/x/hex/hex.ts"],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "null",
  });

  await p.status();
};

const run = async (args: string[], options: ExecuteOptions) => {
  const p = Deno.run({
    cmd: ["deno", "run", "-A", "-r", "main.ts"],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "null",
  });

  await p.status();
};

const test = async (args: string[], options: ExecuteOptions) => {
  const p = Deno.run({
    cmd: ["deno", "task", "test"],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "null",
  });

  await p.status();
};

if (import.meta.main) {
  const executeOptions: ExecuteOptions = {
    command: "hex",
  };

  const commands: Command[] = [
    {
      type: CommandType.SubCommand,
      name: "upgrade",
      // shortcut: "u",
      description: "Upgrades hex cli to the latest version",

      run: (args: string[]) => upgradeCli(args, executeOptions),
    },
    {
      type: CommandType.SubCommand,
      name: "create",
      shortcut: "c",
      description: "Initialize a new project",

      run: (args: string[]) => create(args, executeOptions),
    },
    {
      type: CommandType.SubCommand,
      name: "run",
      // shortcut: "r",
      description: "Runs the project",

      run: (args: string[]) => run(args, executeOptions),
    },
    {
      type: CommandType.SubCommand,
      name: "test",
      // shortcut: "t",
      description: "Runs tests of the project",

      run: (args: string[]) => test(args, executeOptions),
    },
    {
      type: CommandType.Option,
      name: "help",
      shortcut: "h",
      description: "Display help information",
      isDefault: true,

      run: () => showHelp(commands, VERSION, executeOptions),
    },
    {
      type: CommandType.Option,
      name: "version",
      shortcut: "V",
      description: "Display version information",

      run: () => showVersion(VERSION),
    },
  ];

  const args = (typeof Deno !== "undefined") ? Deno.args : [];

  execute(commands, args, executeOptions);
}
