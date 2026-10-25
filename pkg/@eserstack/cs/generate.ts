// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as formats from "@eserstack/formats";
import * as dotenv from "@eserstack/config/dotenv";
import * as sync from "./sync.ts";
import * as ffiClient from "./ffi-client.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

import type { KubectlResourceReference } from "./types.ts";

/** Options for `generate()`. */
export interface GenerateOptions {
  /** Output format of the manifest. */
  format: "yaml" | "json";
  /** Kind and name of the resource to generate. */
  resource: KubectlResourceReference;
  /** Namespace to use when `resource.namespace` is absent. */
  namespace?: string;
  /**
   * Environment name, such as `"production"`, which selects the
   * `.env.<name>` file. When `undefined`, the `.env` files of the default
   * environment are read.
   */
  env: string | undefined;
  /**
   * Directory to resolve `.env` files from. Defaults to the process cwd.
   *
   * Exists so a caller can point at a directory WITHOUT calling chdir. chdir is
   * process-global, so a test that chdir'd into a temp directory changed the
   * cwd of every other test running in that process at that moment -- and
   * deleted it on the way out. Anything that spawned a subprocess or resolved
   * a relative path in that window failed for reasons having nothing to do
   * with itself.
   */
  cwd?: string;
}

/**
 * Generates a ConfigMap or Secret manifest from the `.env` files of an
 * environment. Secret values are Base64-encoded, which is not encryption.
 *
 * @param options - Resource, environment, directory and output format
 * @returns The manifest as YAML or JSON, or a `#` comment line when the
 *   environment has no values
 *
 * @example
 * ```typescript
 * import * as cs from "@eserstack/cs";
 *
 * const manifest = await cs.generate({
 *   resource: { type: "configmap", name: "my-app-config" },
 *   env: "production",
 *   format: "yaml",
 * });
 * ```
 */
export const generate = async (options: GenerateOptions): Promise<string> => {
  await ffiClient.ensureLib();

  // FFI path: when env is undefined, bridge auto-discovers .env + .env.local from CWD.
  const lib = ffiClient.getLib();
  if (lib !== null) {
    try {
      // Go reads the same layered .env files as the TypeScript loader below:
      // .env, .env.<env>, .env.local and .env.<env>.local.
      const requestJSON = JSON.stringify({
        resource: options.resource,
        env: options.env ?? "",
        cwd: options.cwd ?? runtime.process.cwd(),
        format: options.format,
        namespace: options.namespace ?? "",
      });
      const raw = lib.symbols.EserAjanCsGenerate(requestJSON);
      const parsed = JSON.parse(raw) as { result?: string; error?: string };
      if (!parsed.error) {
        return parsed.result ?? "";
      }
      // Non-fatal: fall through to TS fallback
    } catch {
      // Fall through to TS fallback
    }
  }

  // TS fallback: handles FFI error recovery.
  formats.registerBuiltinFormats();

  const resourceType = options.resource.type;
  const resourceName = options.resource.name;
  const resourceNamespace = options.resource.namespace ?? options.namespace;

  const envMap = await dotenv.load({
    baseDir: options.cwd ?? ".",
    env: options.env,
    loadProcessEnv: false,
  });

  if (envMap.size === 0) {
    return `# No environment data found to generate ${resourceType}/${resourceName}`;
  }

  let resource;

  if (resourceType === "secret") {
    resource = sync.buildSecretFromContext(
      resourceName,
      resourceNamespace,
      envMap,
    );
  } else {
    resource = sync.buildConfigMapFromContext(
      resourceName,
      resourceNamespace,
      envMap,
    );
  }

  return await formats.serialize([resource], options.format, { pretty: true });
};
