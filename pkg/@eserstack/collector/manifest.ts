// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as logger from "@eserstack/logging/logger";
import * as collector from "./collector.ts";
import * as ffiClient from "./ffi-client.ts";

/**
 * Creates a JavaScript identifier for a project-relative specifier that is not
 * in `used`, and adds it to `used`.
 *
 * Go answers it (`pkg/ajan/collectorfx`) through the `@eserstack/ajan`
 * bridge, which loads synchronously on first use.
 *
 * @throws {Error} When the bridge does not load (its load error is the
 *   `cause`) or Go refuses the request
 */
export const specifierToIdentifier = (
  specifier: string,
  used: Set<string>,
): string => {
  const answer = ffiClient
    .requireLibSync()
    .call("collectorSpecifierToIdentifier", { specifier, used: [...used] });

  if (answer.error !== undefined) {
    throw new Error(answer.error);
  }

  const identifier = answer.identifier ?? "";
  used.add(identifier);

  return identifier;
};

/** The name a manifest refers to for one export: the name of its value. */
const referenceNameOf = (value: unknown): string =>
  `${(value as { name: string }).name}`;

/**
 * Writes the source of a manifest module for a collection: one namespace
 * import per file and a `manifest` object that refers to each export by the
 * name of its value.
 *
 * Go writes it (`pkg/ajan/collectorfx`) through the `@eserstack/ajan` bridge.
 * The source is not formatted.
 *
 * @throws {Error} When the bridge does not load (its load error is the
 *   `cause`) or Go refuses the request
 */
export const writeManifestToString = async (
  collection: Array<[string, Array<[string, unknown]>]>,
): Promise<string> => {
  const lib = await ffiClient.requireLib();

  const answer = lib.call("collectorGenerateManifest", {
    entries: collection.map(([relPath, exports]) => ({
      relPath,
      exports: exports.map(([, value]) => referenceNameOf(value)),
    })),
  });

  if (answer.error !== undefined) {
    throw new Error(answer.error);
  }

  return answer.source ?? "";
};

export const buildManifest = async (
  target: WritableStream,
  options: collector.CollectExportsOptions,
): Promise<void> => {
  const collection = await collector.collectExports(options);
  const manifestStr = await writeManifestToString(collection);

  const outputWriter = target.getWriter();
  try {
    await outputWriter.ready;
    const encoded = new TextEncoder().encode(manifestStr);
    await outputWriter.write(encoded);
  } finally {
    outputWriter.releaseLock();
  }

  const exportModules = Object.values(collection);
  const exportCount = exportModules.reduce((acc, [, moduleFns]) => {
    acc += moduleFns.length;
    return acc;
  }, 0);

  logger.current.info(
    `The manifest file has been generated for ${exportCount} exports in ${exportModules.length} modules.`,
  );
};

export const buildManifestFile = async (
  filepath: string,
  options: collector.CollectExportsOptions,
): Promise<void> => {
  const collection = await collector.collectExports(options);
  const manifestStr = await writeManifestToString(collection);

  await crossRuntime.runtime.fs.writeTextFile(filepath, manifestStr);

  const exportModules = Object.values(collection);
  const exportCount = exportModules.reduce((acc, [, moduleFns]) => {
    acc += moduleFns.length;
    return acc;
  }, 0);

  logger.current.info(
    `The manifest file has been generated for ${exportCount} exports in ${exportModules.length} modules.`,
  );
};
