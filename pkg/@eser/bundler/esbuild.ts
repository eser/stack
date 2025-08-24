// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as posix from "@std/path/posix";
import * as regexpEscape from "@std/regexp/escape";
import * as jsRuntime from "@eser/standards/js-runtime";
import * as esbuild from "esbuild";

// Import the WASM build on platforms where running subprocesses is not
// permitted, such as Deno Deploy, or when running without `--allow-run`.
import { denoPlugin } from "@deno/esbuild-plugin";

import { Builder, BuildSnapshot } from "./mod.ts";
// import { BUNDLE_PUBLIC_PATH } from "../server/constants.ts";

export type EsbuildBuilderOptions = {
  /** The build ID. */
  buildID: string;
  /** The entrypoints, mapped from name to URL. */
  entrypoints: Record<string, string>;
  /** Whether or not this is a dev build. */
  dev: boolean;
  /** The path to the deno.json / deno.jsonc config file. */
  configPath: string;
  /** The JSX configuration. */
  jsx?: string;
  jsxImportSource?: string;
  target: string | Array<string>;
  absoluteWorkingDir: string;
  basePath?: string;
};

export type EsbuildBuilderState = {
  options: EsbuildBuilderOptions;
};

export const createEsbuildBuilderState = (
  options: EsbuildBuilderOptions,
): EsbuildBuilderState => {
  return {
    options,
  };
};

export class EsbuildBuilder implements Builder {
  readonly state: EsbuildBuilderState;

  constructor(state: EsbuildBuilderState) {
    this.state = state;
  }

  async build(): Promise<BuildSnapshot> {
    const opts = this.state.options;

    try {
      const absWorkingDir = opts.absoluteWorkingDir;

      // In dev-mode we skip identifier minification to be able to show proper
      // component names in React DevTools instead of single characters.
      const minifyOptions: Partial<esbuild.BuildOptions> = opts.dev
        ? {
          minifyIdentifiers: false,
          minifySyntax: true,
          minifyWhitespace: true,
        }
        : { minify: true };

      const bundle = await esbuild.build({
        entryPoints: opts.entrypoints,

        platform: "browser",
        target: opts.target,

        format: "esm",
        bundle: true,
        splitting: true,
        treeShaking: true,
        sourcemap: opts.dev ? "linked" : false,
        ...minifyOptions,

        jsx: opts.jsx === "react"
          ? "transform"
          : opts.jsx === "react-native" || opts.jsx === "preserve"
          ? "preserve"
          : !opts.jsxImportSource
          ? "transform"
          : "automatic",
        jsxImportSource: opts.jsxImportSource ?? "react",

        absWorkingDir,
        outdir: ".",
        // publicPath: BUNDLE_PUBLIC_PATH,
        write: false,
        metafile: true,

        plugins: [
          devClientUrlPlugin(opts.basePath),
          buildIdPlugin(opts.buildID),
          denoPlugin({ configPath: opts.configPath }),
        ],
      });

      const files = new Map<string, Uint8Array>();
      const dependencies = new Map<string, Array<string>>();

      for (const file of bundle.outputFiles) {
        const relativePath = posix.relative(absWorkingDir, file.path);
        files.set(relativePath, file.contents);
      }

      files.set(
        "metafile.json",
        new TextEncoder().encode(JSON.stringify(bundle.metafile)),
      );

      const metaOutputs = new Map(Object.entries(bundle.metafile.outputs));

      for (const [pathStr, entry] of metaOutputs.entries()) {
        const imports = entry.imports
          .filter((importItem) => importItem.kind === "import-statement")
          .map((importItem) => importItem.path);
        dependencies.set(pathStr, imports);
      }

      return new EsbuildSnapshot(
        createEsbuildSnapshotState(files, dependencies),
      );
    } finally {
      esbuild.stop();
    }
  }
}

const devClientUrlPlugin = (basePath?: string): esbuild.Plugin => {
  return {
    name: "dev-client-url",
    setup(build) {
      build.onLoad(
        { filter: /client\.ts$/, namespace: "file" },
        async (args) => {
          // Load the original script
          const contents = await jsRuntime.current.readTextFile(args.path);

          // Replace the URL
          const modifiedContents = contents.replace(
            "/_lime/alive",
            `${basePath}/_lime/alive`,
          );

          return {
            contents: modifiedContents,
            loader: "ts",
          };
        },
      );
    },
  };
};

const buildIdPlugin = (buildId: string): esbuild.Plugin => {
  const file = import.meta.resolve("../runtime/build-id.ts");
  const url = new URL(file);
  let options: esbuild.OnLoadOptions;

  if (url.protocol === "file:") {
    const pathNormalized = posix.fromFileUrl(url);
    const filter = new RegExp(`^${regexpEscape.escape(pathNormalized)}$`);
    options = { filter, namespace: "file" };
  } else {
    const namespace = url.protocol.slice(0, -1);
    const pathNormalized = url.href.slice(namespace.length + 1);
    const filter = new RegExp(`^${regexpEscape.escape(pathNormalized)}$`);
    options = { filter, namespace };
  }

  return {
    name: "lime-build-id",
    setup(build) {
      build.onLoad(
        options,
        () => ({ contents: `export const BUILD_ID = "${buildId}";` }),
      );
    },
  };
};

export type EsbuildSnapshotState = {
  files: Map<string, Uint8Array>;
  dependencyMapping: Map<string, Array<string>>;
};

export const createEsbuildSnapshotState = (
  files: Map<string, Uint8Array>,
  dependencies: Map<string, Array<string>>,
): EsbuildSnapshotState => {
  return {
    files,
    dependencyMapping: dependencies,
  };
};

export class EsbuildSnapshot implements BuildSnapshot {
  readonly state: EsbuildSnapshotState;

  constructor(state: EsbuildSnapshotState) {
    this.state = state;
  }

  get paths(): Array<string> {
    return Array.from(this.state.files.keys());
  }

  read(pathStr: string): Uint8Array | null {
    return this.state.files.get(pathStr) ?? null;
  }

  dependencies(pathStr: string): Array<string> {
    return this.state.dependencyMapping.get(pathStr) ?? [];
  }
}
