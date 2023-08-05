import { type Command, CommandType, type ExecuteOptions } from "./types.ts";

export const showHelp = (
  commands: Command[],
  version: string,
  options: ExecuteOptions,
) => {
  const messageContents = `${options.command ?? "hex"} ${version}

USAGE:
  ${options.command ?? "hex"} [OPTIONS] [SUBCOMMAND]

OPTIONS:
${
    commands.filter((command) => command.type === CommandType.Option)
      .map((command) => {
        const left = `${(command.shortcut
          ? `-${command.shortcut}, `
          : "")}--${command.name}`;
        const right = command.description;

        return `  ${left.padEnd(20)}${right}`;
      }).join("\n")
  }

SUBCOMMANDS:
${
    commands.filter((command) => command.type === CommandType.SubCommand)
      .map((command) => {
        const left =
          `${(command.shortcut ? `${command.shortcut}, ` : "")}${command.name}`;
        const right = command.description;

        return `  ${left.padEnd(20)}${right}`;
      }).join("\n")
  }
`;

  console.log(messageContents);
};

export const showVersion = (version: string, options: ExecuteOptions) => {
  const messageContents = `${options.command ?? "hex"} version ${version}`;

  console.log(messageContents);
};
