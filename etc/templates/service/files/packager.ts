import { LibName, build, emptyDir } from "https://deno.land/x/dnt/mod.ts";
import packageJson from "./package.json" assert { type: "json" };
import denoJson from "./deno.json" assert { type: "json" };

await emptyDir("./dist");

await build({
  packageManager: "yarn",
  entryPoints: [
    "./src/app.ts",
  ],
  outDir: "./dist",
  package: packageJson,
  importMap: denoJson.importMap,
  shims: {
    custom: [
      // web streams
      {
        package: {
          name: "web-streams-polyfill", // stream/web
          subPath: "ponyfill/es2018",
          version: "3.2.1",
        },
        globalNames: [
          {
            name: "ReadableStream",
            exportName: "ReadableStream",
          },
          {
            name: "TransformStream",
            exportName: "TransformStream",
          },
        ],
      },
      // error event
      {
        module: "https://deno.land/x/hex@0.5.2/src/shims/error-event/error-event.ts",
        globalNames: [
          {
            name: "ErrorEvent",
            exportName: "ErrorEvent",
          },
        ],
      },
    ],
    // see JS docs for overview and more options
    deno: true,
    // replaces node.js timers with browser-API compatible ones
    timers: true,
    // the global confirm, alert, and prompt functions
    prompts: true,
    // shims the Blob global with the one from the "buffer" module
    blob: true,
    // shims the crypto global.
    crypto: true,
    // shims DOMException
    domException: true,
    // shims fetch, File, FormData, Headers, Request, and Response
    undici: true,
    // shams (checker) for the global.WeakRef, helps type-checking only
    weakRef: true,
    // shims WebSocket
    webSocket: true,
  },
  mappings: {
    "https://deno.land/x/oak@v11.1.0/http_server_native.ts": "https://deno.land/x/oak@v11.1.0/http_server_node.ts",
  },
  typeCheck: false,
  test: false,
  declaration: true,
  compilerOptions: {
    // importHelpers: tsconfigJson?.compilerOptions?.importHelpers,
    importHelpers: true,
    // target: tsconfigJson?.compilerOptions?.target,
    target: "ES2017",
    // sourceMap: tscconfigJson?.compilerOptions?.sourceMap,
    // inlineSources: tscconfigJson?.compilerOptions?.inlineSources,
    // lib: denoJson?.compilerOptions?.lib as LibName[] | undefined,
    lib: ["esnext", "dom", "dom.iterable"], // , "dom.asynciterable"
    // skipLibCheck: tsconfigJson?.compilerOptions?.skipLibCheck,
  },
  scriptModule: "cjs",
});

// post build steps
Deno.copyFileSync("LICENSE", "dist/LICENSE");
Deno.copyFileSync("README.md", "dist/README.md");
Deno.copyFileSync("CODE_OF_CONDUCT.md", "dist/CODE_OF_CONDUCT.md");
Deno.copyFileSync("CONTRIBUTING.md", "dist/CONTRIBUTING.md");
Deno.copyFileSync("SECURITY.md", "dist/SECURITY.md");
