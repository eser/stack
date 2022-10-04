import { logLevels } from "./deps.ts";
import * as options from "../options/mod.ts";

// interface definitions
interface ServiceOptions {
  port: number;
  logs: logLevels.LevelName;
}

// public functions
const createOptionsBuilder = async <TOptions extends ServiceOptions>() => {
  const builder = await options.createBuilder<TOptions>();

  builder.load((env, opts) => {
    opts.port = env.readInt("PORT", 3000);
    opts.logs = env.readEnum<logLevels.LevelName>("LOGS", [
      "DEBUG",
      "INFO",
      "WARNING",
      "ERROR",
      "CRITICAL",
    ], "INFO");
  });

  return builder;
};

export { createOptionsBuilder, type ServiceOptions };
