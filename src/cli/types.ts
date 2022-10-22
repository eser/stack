enum CommandType {
  SubCommand = "subcommand",
  Option = "option",
}

interface Command {
  type: CommandType;
  name: string;
  shortcut?: string;
  description: string;
  isDefault?: boolean;

  run: (args: string[]) => void;
}

export { type Command, CommandType };
