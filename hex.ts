import { type Command, CommandType, execute, showHelp, showVersion, ExecuteOptions } from "./src/cli/mod.ts";
import { create } from "./src/generator/create.ts";

const VERSION = "0.0.1";

if (import.meta.main) {
  const executeOptions: ExecuteOptions = {
    command: "hex",
  };

  const commands: Command[] = [
    {
      type: CommandType.SubCommand,
      name: "create",
      shortcut: "c",
      description: "Initialize a new project",

      run: (args: string[]) => create(args, executeOptions),
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
