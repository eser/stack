interface ExecuteOptions {
  command?: string;
  module?: string;
  moduleRelative?: string;
}

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

  run: (args: string[], options: ExecuteOptions) => void;
}

export { type Command, CommandType, type ExecuteOptions };
