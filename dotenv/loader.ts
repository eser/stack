import { deno, dotenv } from "../deps.ts";
import { defaultEnvValue, defaultEnvVar, env, type EnvMap } from "./base.ts";

// interface definitions
export interface LoaderOptions {
  baseDir?: string;
  defaultEnvVar?: string;
  defaultEnvValue?: string;
}

// public functions
export const parseEnvString = (
  rawDotenv: string,
): ReturnType<typeof dotenv.parse> => {
  return dotenv.parse(rawDotenv);
};

export const parseEnvFromFile = async (
  filepath: string,
): Promise<ReturnType<typeof parseEnvString>> => {
  try {
    const data = await deno.readFile(filepath);
    const decoded = new TextDecoder("utf-8").decode(data);
    const escaped = decodeURIComponent(decoded);

    const result = parseEnvString(escaped);

    return result;
  } catch (e) {
    if (e instanceof deno.errors.NotFound) {
      return {};
    }

    throw e;
  }
};

export const load = async (
  options?: LoaderOptions,
): Promise<EnvMap> => {
  const options_ = {
    baseDir: ".",
    defaultEnvVar: defaultEnvVar,
    defaultEnvValue: defaultEnvValue,
    ...(options ?? {}),
  };

  const sysVars = deno.env.toObject();
  const envName = sysVars[options_.defaultEnvVar] ?? options_.defaultEnvValue;

  const vars = new Map<typeof env | string, string>();
  vars.set(env, envName);

  const envImport = (entries: Record<string, string>) => {
    for (const [key, value] of Object.entries(entries)) {
      vars.set(key, value);
    }
  };

  console.log(`${options_.baseDir}/.env`);
  envImport(await parseEnvFromFile(`${options_.baseDir}/.env`));
  envImport(await parseEnvFromFile(`${options_.baseDir}/.env.${envName}`));
  if (envName !== "test") {
    envImport(await parseEnvFromFile(`${options_.baseDir}/.env.local`));
  }
  envImport(
    await parseEnvFromFile(`${options_.baseDir}/.env.${envName}.local`),
  );

  envImport(sysVars);

  return vars;
};
