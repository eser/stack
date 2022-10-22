import { type Command, CommandType } from "./types.ts";
import { flags } from "./deps.ts";

const execute = (commands: Command[], args: string[]) => {
  const params = flags.parse(args, {
    alias: commands.reduce<Record<string, string>>((acc, command) => {
      if (command.shortcut !== undefined) {
        acc[command.shortcut] = command.name;
      }

      return acc;
    }, {}),
    boolean: commands.filter((command) => command.type === CommandType.Option)
      .map((command) => command.name),
  });

  // subcommands
  const firstParam = params._?.[0] as string | undefined;

  if (firstParam !== undefined) {
    const subcommand = commands.find((command) =>
      command.type === CommandType.SubCommand &&
      [command.name, command.shortcut].includes(firstParam)
    );

    if (subcommand !== undefined) {
      subcommand.run(args.slice(1));
      return;
    }
  }

  // options
  const option = commands.find((command) =>
    command.type === CommandType.Option && params[command.name]
  );

  if (option !== undefined) {
    option.run(args);
    return;
  }

  // default
  if (params._.length === 0) {
    const defaultCommand = commands.find((command) => command.isDefault);

    if (defaultCommand !== undefined) {
      defaultCommand.run(args);
      return;
    }
  }

  // otherwise
  console.log(`Command not found - ${params._.join(" ")}`);
};

export { execute, execute as default };
