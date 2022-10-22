import { type Command, CommandType } from "./types.ts";

const showHelp = (commands: Command[], version: string) => {
  const messageContents = `hex ${version}

USAGE:
  hex [OPTIONS] [SUBCOMMAND]

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

const showVersion = (version: string) => {
  const messageContents = `hex version ${version}`;

  console.log(messageContents);
};

export { showHelp, showVersion };
