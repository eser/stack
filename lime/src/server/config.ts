import { dirname, fromFileUrl, isAbsolute, join, JSONC } from "./deps.ts";
import { type FromManifestConfig, type Manifest } from "./mod.ts";
import { DEFAULT_RENDER_FN } from "./render.ts";
import {
  type DenoConfig,
  type InternalLimeState,
  ResolvedLimeConfig,
} from "./types.ts";

export async function locateDenoConfig(
  directory: string,
  searchParents = false,
): Promise<string | undefined> {
  let dir = directory;

  while (true) {
    for (const name of ["deno.jsonc", "deno.json"]) {
      const path = join(dir, name);
      const fileInfo = await Deno.stat(path);

      if (fileInfo.isFile) {
        console.log(path);
        return path;
      }
    }

    if (!searchParents) {
      break;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return undefined;
}

export async function readDenoConfig(
  directory: string,
): Promise<{ config: DenoConfig; path: string }> {
  const path = await locateDenoConfig(directory, true);

  if (path === undefined) {
    throw new Error(
      `Could not find a deno.json file in the current directory or any parent directory.`,
    );
  }

  const file = await Deno.readTextFile(path);
  return { config: JSONC.parse(file) as DenoConfig, path };
}

function isObject(value: unknown) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value);
}

export async function getInternalLimeState(
  manifest: Manifest,
  config: FromManifestConfig,
): Promise<InternalLimeState> {
  const base = dirname(fromFileUrl(manifest.baseUrl));
  const { config: denoJson, path: denoJsonPath } = await readDenoConfig(base);

  if (typeof denoJson.importMap !== "string" && !isObject(denoJson.imports)) {
    throw new Error(
      "deno.json must contain an 'importMap' or 'imports' property.",
    );
  }

  const internalConfig: ResolvedLimeConfig = {
    dev: config.dev ?? false,
    build: {
      outDir: config.build?.outDir
        ? parseFileOrUrl(config.build.outDir, base)
        : join(base, "_lime"),
      target: config.build?.target ?? ["chrome99", "firefox99", "safari15"],
    },
    plugins: config.plugins ?? [],
    staticDir: config.staticDir
      ? parseFileOrUrl(config.staticDir, base)
      : join(base, "static"),
    render: config.render ?? DEFAULT_RENDER_FN,
    router: config.router,
    server: config.server ?? {},
  };

  if (config.cert) {
    internalConfig.server.cert = config.cert;
  }
  if (config.hostname) {
    internalConfig.server.hostname = config.hostname;
  }
  if (config.key) {
    internalConfig.server.key = config.key;
  }
  if (config.onError) {
    internalConfig.server.onError = config.onError;
  }
  if (config.onListen) {
    internalConfig.server.onListen = config.onListen;
  }
  if (config.port) {
    internalConfig.server.port = config.port;
  }
  if (config.reusePort) {
    internalConfig.server.reusePort = config.reusePort;
  }
  if (config.signal) {
    internalConfig.server.signal = config.signal;
  }

  return {
    config: internalConfig,
    manifest,
    loadSnapshot: true,
    denoJsonPath,
    denoJson,
  };
}

function parseFileOrUrl(input: string, base: string) {
  if (input.startsWith("file://")) {
    return fromFileUrl(input);
  } else if (!isAbsolute(input)) {
    return join(base, input);
  }

  return input;
}
