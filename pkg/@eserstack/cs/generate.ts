// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as formats from "@eserstack/formats";
import * as dotenv from "@eserstack/config/dotenv";
import * as sync from "./sync.ts";
import { ensureLib, getLib } from "./ffi-client.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

import type { KubectlResourceReference } from "./types.ts";

export interface GenerateOptions {
  format: "yaml" | "json";
  resource: KubectlResourceReference;
  namespace?: string;
  env: string | undefined;
}

export const generate = async (options: GenerateOptions): Promise<string> => {
  await ensureLib();

  // FFI path: when env is undefined, bridge auto-discovers .env + .env.local from CWD.
  const lib = getLib();
  if (lib !== null) {
    try {
      const cwd = runtime.process.cwd();
      const envFilePath = options.env != null
        ? runtime.path.join(cwd, `.env.${options.env}`)
        : "";
      const requestJSON = JSON.stringify({
        resource: options.resource,
        envFile: envFilePath,
        cwd: options.env == null ? cwd : "",
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
