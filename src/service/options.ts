import { logLevels } from "./deps.ts";
import * as options from "../options/mod.ts";

// interface definitions
interface ServiceOptionsValues {
  port: number;
  logs: logLevels.LevelName;
}

type ServiceOptions = options.Options<ServiceOptionsValues>;

// public functions
const loadServiceOptions = async (): Promise<ServiceOptions> => {
  const serviceOptions = await options.loadOptions<ServiceOptionsValues>(
    (env, opts) => {
      opts.port = env.readInt("PORT", 3000);
      opts.logs = env.readEnum<logLevels.LevelName>("LOGS", [
        "DEBUG",
        "INFO",
        "WARNING",
        "ERROR",
        "CRITICAL",
      ], "INFO");
    },
  );

  return serviceOptions;
};

export { loadServiceOptions, type ServiceOptions };
