import { type Command, CommandType, execute, showHelp, showVersion } from "@hex/cli/mod.ts";
import { init } from "@hex/generator/init.ts";

const VERSION = "0.0.1";

if (import.meta.main) {
  const commands: Command[] = [
    {
      type: CommandType.SubCommand,
      name: "init",
      shortcut: "i",
      description: "Initialize a new project",

      run: (args: string[]) => init(args),
    },
    {
      type: CommandType.Option,
      name: "help",
      shortcut: "h",
      description: "Display help information",
      isDefault: true,

      run: () => showHelp(commands, VERSION),
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

  execute(commands, args);
}
