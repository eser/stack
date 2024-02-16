// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as runtime from "../standards/runtime.ts";
import { esbuild, esbuildDenoPlugins, path, regexpEscape } from "./deps.ts";
import { Builder, BuildSnapshot } from "./mod.ts";
// import { BUNDLE_PUBLIC_PATH } from "../server/constants.ts";

export interface EsbuildBuilderOptions {
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
}

export class EsbuildBuilder implements Builder {
  #options: EsbuildBuilderOptions;

  constructor(options: EsbuildBuilderOptions) {
    this.#options = options;
  }

  async build(): Promise<EsbuildSnapshot> {
    const opts = this.#options;

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
        target: this.#options.target,

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
          ...esbuildDenoPlugins({ configPath: opts.configPath }),
        ],
      });

      const files = new Map<string, Uint8Array>();
      const dependencies = new Map<string, Array<string>>();

      for (const file of bundle.outputFiles) {
        const relativePath = path.relative(absWorkingDir, file.path);
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

      return new EsbuildSnapshot(files, dependencies);
    } finally {
      esbuild.stop();
    }
  }
}

function devClientUrlPlugin(basePath?: string): esbuild.Plugin {
  return {
    name: "dev-client-url",
    setup(build) {
      build.onLoad(
        { filter: /client\.ts$/, namespace: "file" },
        async (args) => {
          // Load the original script
          const contents = await runtime.current.readTextFile(args.path);

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
}

function buildIdPlugin(buildId: string): esbuild.Plugin {
  const file = import.meta.resolve("../runtime/build-id.ts");
  const url = new URL(file);
  let options: esbuild.OnLoadOptions;

  if (url.protocol === "file:") {
    const pathNormalized = path.fromFileUrl(url);
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
}

export class EsbuildSnapshot implements BuildSnapshot {
  #files: Map<string, Uint8Array>;
  #dependencies: Map<string, Array<string>>;

  constructor(
    files: Map<string, Uint8Array>,
    dependencies: Map<string, Array<string>>,
  ) {
    this.#files = files;
    this.#dependencies = dependencies;
  }

  get paths(): Array<string> {
    return Array.from(this.#files.keys());
  }

  read(pathStr: string): Uint8Array | null {
    return this.#files.get(pathStr) ?? null;
  }

  dependencies(pathStr: string): Array<string> {
    return this.#dependencies.get(pathStr) ?? [];
  }
}
