export interface ExecuteOptions {
  command?: string;
  module?: string;
  moduleRelative?: string;
}

export enum CommandType {
  SubCommand = "subcommand",
  Option = "option",
}

export enum ValueType {
  NoValue = "no-value",
  Boolean = "boolean",
  String = "string",
}

export interface Command {
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
    executeOptions?: ExecuteOptions,
  ) => void;
}
