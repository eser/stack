import { type Command, CommandType, ExecuteOptions } from "./types.ts";
import { flags, pathPosix } from "./deps.ts";

const getRelativePath = (originUrl: string) => {
  const url = new URL(originUrl);

  if (url.protocol === "file:") {
    return pathPosix.relative(
      Deno.cwd(),
      pathPosix.fromFileUrl(url.href),
    );
  }

  return url.href;
};

const validateOptions = (options: ExecuteOptions) => {
  const newOptions: ExecuteOptions = {
    ...options,
    moduleRelative: (options.moduleRelative)
      ? options.moduleRelative
      : (options.module !== undefined)
      ? getRelativePath(options.module)
      : undefined,
  };

  return newOptions;
};

const execute = (
  commands: Command[],
  args: string[],
  options: ExecuteOptions,
) => {
  const options_ = validateOptions(options);

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
      subcommand.run(args.slice(1), options_);
      return;
    }
  }

  // options
  const option = commands.find((command) =>
    command.type === CommandType.Option && params[command.name]
  );

  if (option !== undefined) {
    option.run(args, options_);
    return;
  }

  // default
  if (params._.length === 0) {
    const defaultCommand = commands.find((command) => command.isDefault);

    if (defaultCommand !== undefined) {
      defaultCommand.run(args, options_);
      return;
    }
  }

  // otherwise
  console.log(`Command not found - ${params._.join(" ")}`);
};

export { execute, execute as default, validateOptions };
