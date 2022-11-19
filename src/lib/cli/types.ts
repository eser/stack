interface ExecuteOptions {
  command?: string;
  module?: string;
  moduleRelative?: string;
}

enum CommandType {
  SubCommand = "subcommand",
  Option = "option",
}

enum ValueType {
  NoValue = "no-value",
  Boolean = "boolean",
  String = "string",
}

interface Command {
  type: CommandType;
  name: string;
  shortcut?: string;
  description: string;
  isDefault?: boolean;
  defaultValue?: string | boolean;
  valueType?: ValueType;

  subcommands?: Command[];

  run?: (
    args: string[],
    options: Record<string, string>,
    executeOptions: ExecuteOptions,
  ) => void;
}

export { type Command, CommandType, type ExecuteOptions, ValueType };
