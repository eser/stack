import { dotenv } from "./deps.ts";

// inteface definitions
interface LoadEnvOptions {
  baseDir?: string;
  defaultEnvVar?: string;
  defaultEnvValue?: string;
}

interface LoadEnvResult {
  envName: string;
  [key: string]: string;
}

// public functions
const loadEnvFile = async (filepath: string): Promise<dotenv.DotenvConfig> => {
  try {
    const data = await Deno.readFile(filepath);
    const decoded = new TextDecoder("utf-8").decode(data);
    const escaped = decodeURIComponent(decoded);

    const result = dotenv.parse(escaped);

    return result;
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return <dotenv.DotenvConfig> {};
    }
    throw e;
  }
};

const loadEnv = async (options?: LoadEnvOptions): Promise<LoadEnvResult> => {
  const options_ = {
    baseDir: ".",
    defaultEnvVar: "ENV",
    defaultEnvValue: "development",
    ...(options ?? {}),
  };

  const sysVars = (typeof Deno !== "undefined") ? Deno.env.toObject() : {};
  const envName = sysVars[options_.defaultEnvVar] ?? options_.defaultEnvValue;

  const vars = await loadEnvFile(`${options_.baseDir}/.env`);

  Object.assign(vars, await loadEnvFile(`${options_.baseDir}/.env.${envName}`));
  if (envName !== "test") {
    Object.assign(vars, await loadEnvFile(`${options_.baseDir}/.env.local`));
  }
  Object.assign(
    vars,
    await loadEnvFile(`${options_.baseDir}/.env.${envName}.local`),
  );
  Object.assign(vars, sysVars);

  return {
    envName: envName,
    ...vars,
  };
};

export { loadEnv, type LoadEnvOptions, type LoadEnvResult };
