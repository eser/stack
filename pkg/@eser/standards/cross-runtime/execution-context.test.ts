// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as execCtx from "./execution-context.ts";

// =============================================================================
// Test fixtures
// =============================================================================

const ESER_OPTS: execCtx.CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eser/cli",
};

const CUSTOM_OPTS: execCtx.CliCommandOptions = {
  command: "foo",
  devCommand: "make run",
  npmPackage: "bar",
  jsrPackage: "@foo/bar",
};

// Helper to call detectInvoker with common defaults
const detect = (
  execBasename: string,
  runtimeName: string,
  argv: readonly string[],
  envVars: Record<string, string | undefined> = {},
  mainModule?: string,
  isDevContext?: boolean,
) =>
  execCtx.detectInvoker(
    execBasename,
    runtimeName,
    argv,
    envVars,
    mainModule,
    isDevContext,
  );

// =============================================================================
// detectInvoker()
// =============================================================================

describe("detectInvoker", () => {
  describe("compiled binary detection", () => {
    it("should detect deno compile output by custom binary name", () => {
      assert.assertEquals(
        detect("eser", "unknown", ["/usr/local/bin/eser", "init"]),
        { invoker: "binary", mode: "installed" },
      );
    });

    it("should detect compiled binary with absolute path", () => {
      assert.assertEquals(
        detect("my-tool", "unknown", ["/opt/tools/my-tool", "run"]),
        { invoker: "binary", mode: "installed" },
      );
    });

    it("should detect compiled binary with single-letter name", () => {
      assert.assertEquals(
        detect("e", "unknown", ["/usr/bin/e", "doctor"]),
        { invoker: "binary", mode: "installed" },
      );
    });

    it("should detect compiled when both execBasename and runtimeName are unknown", () => {
      assert.assertEquals(
        detect("something", "unknown", []),
        { invoker: "binary", mode: "installed" },
      );
    });

    it("should detect compiled with empty execBasename", () => {
      assert.assertEquals(
        detect("", "unknown", []),
        { invoker: "binary", mode: "installed" },
      );
    });

    it("should detect compiled when runtimeName is non-standard (e.g. workerd)", () => {
      assert.assertEquals(
        detect("my-cli", "workerd", ["/usr/bin/my-cli"]),
        { invoker: "binary", mode: "installed" },
      );
    });
  });

  describe("version manager fallback (nvm, fnm, volta, asdf, mise)", () => {
    it("should fall back to runtimeName when nvm uses custom 'node20' binary", () => {
      assert.assertEquals(
        detect("node20", "node", [
          "/home/user/.nvm/versions/node/v20.0.0/bin/node20",
          "/path/to/script.js",
        ]),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should fall back to runtimeName when fnm uses versioned 'n25.0' binary", () => {
      assert.assertEquals(
        detect("n25.0", "node", [
          "/home/user/.fnm/node-versions/v25.0/bin/n25.0",
          "/path/to/script.js",
        ]),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should fall back to runtimeName with volta custom node shim", () => {
      assert.assertEquals(
        detect("volta-node", "node", [
          "/home/user/.volta/bin/volta-node",
          "/path/to/script.js",
        ]),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should detect npx via argv[1] even with asdf custom node binary", () => {
      assert.assertEquals(
        detect("node-v20", "node", [
          "/home/user/.asdf/installs/nodejs/20.0.0/bin/node-v20",
          "/home/user/.npm/_npx/abc/eser",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should fall back to runtimeName with mise custom deno binary", () => {
      assert.assertEquals(
        detect("deno-canary", "deno", [
          "/home/user/.local/share/mise/installs/deno/canary/bin/deno-canary",
          "run",
          "script.ts",
        ]),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should fall back to runtimeName with custom bun binary + BUN_INSTALL", () => {
      assert.assertEquals(
        detect("bun-canary", "bun", [
          "/home/user/.bun/bin/bun-canary",
          "/path/to/eser",
        ], { BUN_INSTALL: "/home/user/.bun" }),
        { invoker: "bun", mode: "installed" },
      );
    });

    it("should fall back to runtimeName with custom bun binary without BUN_INSTALL", () => {
      assert.assertEquals(
        detect("bun-canary", "bun", ["/home/user/.bun/bin/bun-canary", "eser"]),
        { invoker: "bunx", mode: "on-demand" },
      );
    });
  });

  describe("Node.js: npx detection via argv[1]", () => {
    it("should detect npx from classic _npx cache path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.npm/_npx/abc123def/node_modules/.bin/eser",
          "init",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should detect npx from npm 7+ _npx path with nested hash", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/Users/user/.npm/_npx/5f4b3c2a/node_modules/eser/bin/eser.mjs",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should detect npx from script path containing /npx/ segment", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/usr/local/lib/npx/eser/bin.js",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should detect npx from Windows-style _npx path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "C:\\Users\\user\\AppData\\Local\\npm-cache\\_npx\\abc\\eser.js",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });
  });

  describe("Node.js: npx detection via env fallback", () => {
    it("should detect npx from npm_execpath pointing to npx-cli.js", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/clean/path/to/eser"], {
          npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js",
        }),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should detect npx from npm_execpath containing 'npx' in path", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_execpath: "/usr/local/share/npx/cli.js",
        }),
        { invoker: "npx", mode: "on-demand" },
      );
    });
  });

  describe("Node.js: pnpm/pnpx detection via argv[1]", () => {
    it("should detect pnpx from script path in pnpm store", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.local/share/pnpm/store/v3/tmp/eser",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    it("should detect pnpx from pnpm dlx cache path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/tmp/pnpm-dlx-abc123/node_modules/.bin/eser",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    it("should detect pnpx from script path containing 'pnpx'", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.local/pnpx/cache/eser/bin.js",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });
  });

  describe("Node.js: pnpm/pnpx detection via env fallback", () => {
    it("should detect pnpx from npm_execpath pointing to pnpm.cjs", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/clean/path/to/eser"], {
          npm_execpath: "/home/user/.local/share/pnpm/pnpm.cjs",
        }),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    it("should detect pnpx from npm_execpath containing 'pnpm'", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_execpath: "/usr/local/lib/pnpm/bin/pnpm.cjs",
        }),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });
  });

  describe("Node.js: pnpm global install via user agent", () => {
    it("should detect pnpm from npm_config_user_agent starting with 'pnpm/'", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/usr/local/lib/node_modules/eser/bin/eser.js",
        ], {
          npm_config_user_agent: "pnpm/8.15.0 npm/? node/v20.11.0 darwin arm64",
        }),
        { invoker: "pnpm", mode: "installed" },
      );
    });

    it("should detect pnpm from user agent with pnpm in middle", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_config_user_agent: "npm/10.0.0 pnpm/9.0.0 node/v22.0.0 linux x64",
        }),
        { invoker: "pnpm", mode: "installed" },
      );
    });
  });

  describe("Node.js: npm global install (default fallback)", () => {
    it("should default to npm with no special env vars", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/usr/local/lib/node_modules/eser/bin/eser.js",
        ]),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should default to npm with empty env vars", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/path/to/script.js"], {
          npm_execpath: "",
          npm_config_user_agent: "",
        }),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should default to npm when user agent has no pnpm", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_config_user_agent: "npm/10.0.0 node/v20.0.0 darwin arm64",
        }),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should default to npm with empty argv", () => {
      assert.assertEquals(
        detect("node", "node", []),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should default to npm with only exec in argv, no script path", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node"]),
        { invoker: "npm", mode: "installed" },
      );
    });
  });

  describe("Node.js: priority ordering (argv[1] beats env vars)", () => {
    it("should let argv[1] npx take priority over pnpm env", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.npm/_npx/abc/eser",
        ], {
          npm_config_user_agent: "pnpm/8.0.0",
        }),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should let argv[1] pnpm take priority over npx env", () => {
      assert.assertEquals(
        detect(
          "node",
          "node",
          ["/usr/bin/node", "/home/user/.pnpm/store/eser"],
          {
            npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js",
          },
        ),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });
  });

  describe("Bun runtime", () => {
    it("should detect bun global install when BUN_INSTALL is set", () => {
      assert.assertEquals(
        detect("bun", "bun", [
          "/usr/bin/bun",
          "/home/user/.bun/install/global/eser/bin/eser.js",
        ], {
          BUN_INSTALL: "/home/user/.bun",
        }),
        { invoker: "bun", mode: "installed" },
      );
    });

    it("should detect bun global install when BUN_INSTALL is empty string", () => {
      assert.assertEquals(
        detect("bun", "bun", ["/usr/bin/bun", "/path/to/eser"], {
          BUN_INSTALL: "",
        }),
        { invoker: "bun", mode: "installed" },
      );
    });

    it("should detect bunx on-demand when no BUN_INSTALL", () => {
      assert.assertEquals(
        detect("bun", "bun", ["/usr/bin/bun", "x", "eser", "init"]),
        { invoker: "bunx", mode: "on-demand" },
      );
    });

    it("should detect bunx when BUN_INSTALL is undefined", () => {
      assert.assertEquals(
        detect("bun", "bun", ["/usr/bin/bun", "eser"], {
          BUN_INSTALL: undefined,
        }),
        { invoker: "bunx", mode: "on-demand" },
      );
    });

    it("should detect bunx with empty env", () => {
      assert.assertEquals(
        detect("bun", "bun", ["/usr/bin/bun", "eser"]),
        { invoker: "bunx", mode: "on-demand" },
      );
    });
  });

  describe("Deno: on-demand (jsr: and https:)", () => {
    it("should detect on-demand from jsr: main module", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "jsr:@eser/cli"],
          {},
          "jsr:@eser/cli",
        ),
        { invoker: "deno", mode: "on-demand" },
      );
    });

    it("should detect on-demand from jsr: with version", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "jsr:@eser/cli@4.0.0"],
          {},
          "jsr:@eser/cli@4.0.0",
        ),
        { invoker: "deno", mode: "on-demand" },
      );
    });

    it("should detect on-demand from https: URL (deno.land)", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "https://deno.land/x/eser/main.ts"],
          {},
          "https://deno.land/x/eser/main.ts",
        ),
        { invoker: "deno", mode: "on-demand" },
      );
    });

    it("should detect on-demand from https: URL (esm.sh)", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "https://esm.sh/eser"],
          {},
          "https://esm.sh/eser",
        ),
        { invoker: "deno", mode: "on-demand" },
      );
    });
  });

  describe("Deno: installed (deno install -g)", () => {
    it("should detect installed from local file module", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "/home/user/.deno/bin/eser"],
          {},
          "/home/user/.deno/bin/eser",
        ),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should detect installed from file:// URL when not dev context", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "file:///home/user/.deno/bin/eser"],
          {},
          "file:///home/user/.deno/bin/eser",
        ),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should detect installed when no main module provided", () => {
      assert.assertEquals(
        detect("deno", "deno", ["/usr/bin/deno"]),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should detect installed when mainModule is undefined", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "run", "script.ts"],
          {},
          undefined,
        ),
        { invoker: "deno", mode: "installed" },
      );
    });
  });

  describe("Deno: dev context", () => {
    it("should detect dev mode when isDevContext is true", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "task", "cli"],
          {},
          "file:///workspace/pkg/@eser/cli/main.ts",
          true,
        ),
        { invoker: "dev", mode: "dev" },
      );
    });

    it("should let isDevContext true override file:// installed", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno"],
          {},
          "file:///some/local/path.ts",
          true,
        ),
        { invoker: "dev", mode: "dev" },
      );
    });

    it("should fall through to installed when isDevContext is false", () => {
      assert.assertEquals(
        detect(
          "deno",
          "deno",
          ["/usr/bin/deno", "task", "cli"],
          {},
          "file:///workspace/main.ts",
          false,
        ),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should let jsr: take priority over isDevContext", () => {
      assert.assertEquals(
        detect("deno", "deno", ["/usr/bin/deno"], {}, "jsr:@eser/cli", true),
        { invoker: "deno", mode: "on-demand" },
      );
    });
  });

  describe("execBasename vs runtimeName resolution", () => {
    it("should use execBasename 'node' directly, ignoring runtimeName 'deno'", () => {
      assert.assertEquals(
        detect("node", "deno", ["/usr/bin/node", "/script.js"]),
        { invoker: "npm", mode: "installed" },
      );
    });

    it("should use execBasename 'deno' directly, ignoring runtimeName 'node'", () => {
      assert.assertEquals(
        detect("deno", "node", ["/usr/bin/deno"]),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should use execBasename 'bun' directly, ignoring runtimeName 'node'", () => {
      assert.assertEquals(
        detect("bun", "node", ["/usr/bin/bun", "eser"]),
        { invoker: "bunx", mode: "on-demand" },
      );
    });

    it("should fall back to runtimeName 'deno' when execBasename is unknown", () => {
      assert.assertEquals(
        detect("custom-deno", "deno", [
          "/path/to/custom-deno",
          "run",
          "script.ts",
        ]),
        { invoker: "deno", mode: "installed" },
      );
    });

    it("should fall back to runtimeName 'bun' + BUN_INSTALL when execBasename is unknown", () => {
      assert.assertEquals(
        detect("custom-bun", "bun", ["/path/to/custom-bun", "eser"], {
          BUN_INSTALL: "/home/user/.bun",
        }),
        { invoker: "bun", mode: "installed" },
      );
    });

    it("should fall back to runtimeName 'node' + npx env when execBasename is unknown", () => {
      assert.assertEquals(
        detect("nodejs-custom", "node", [
          "/usr/bin/nodejs-custom",
          "/clean/path",
        ], {
          npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js",
        }),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    it("should detect binary when both execBasename and runtimeName are unknown", () => {
      assert.assertEquals(
        detect("wat", "browser", []),
        { invoker: "binary", mode: "installed" },
      );
    });
  });
});

// =============================================================================
// buildCommand()
// =============================================================================

describe("buildCommand", () => {
  describe("installed invokers → opts.command", () => {
    it("should return opts.command for binary/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("binary", "installed", ESER_OPTS),
        "eser",
      );
    });

    it("should return opts.command for npm/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("npm", "installed", ESER_OPTS),
        "eser",
      );
    });

    it("should return opts.command for pnpm/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("pnpm", "installed", ESER_OPTS),
        "eser",
      );
    });

    it("should return opts.command for bun/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("bun", "installed", ESER_OPTS),
        "eser",
      );
    });

    it("should return opts.command for deno/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("deno", "installed", ESER_OPTS),
        "eser",
      );
    });

    it("should return opts.command for unknown/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("unknown", "installed", ESER_OPTS),
        "eser",
      );
    });
  });

  describe("on-demand invokers → package manager prefix", () => {
    it("should return 'npx {pkg}' for npx/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("npx", "on-demand", ESER_OPTS),
        "npx eser",
      );
    });

    it("should return 'pnpx {pkg}' for pnpx/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("pnpx", "on-demand", ESER_OPTS),
        "pnpx eser",
      );
    });

    it("should return 'bunx {pkg}' for bunx/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("bunx", "on-demand", ESER_OPTS),
        "bunx eser",
      );
    });

    it("should return 'deno run --allow-all jsr:{pkg}' for deno/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("deno", "on-demand", ESER_OPTS),
        "deno run --allow-all jsr:@eser/cli",
      );
    });
  });

  describe("dev invoker → opts.devCommand", () => {
    it("should return opts.devCommand for dev/dev", () => {
      assert.assertEquals(
        execCtx.buildCommand("dev", "dev", ESER_OPTS),
        "deno task cli",
      );
    });
  });

  describe("custom opts parameterization", () => {
    it("should use custom npmPackage for npx", () => {
      assert.assertEquals(
        execCtx.buildCommand("npx", "on-demand", CUSTOM_OPTS),
        "npx bar",
      );
    });

    it("should use custom jsrPackage for deno on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("deno", "on-demand", CUSTOM_OPTS),
        "deno run --allow-all jsr:@foo/bar",
      );
    });

    it("should use custom devCommand for dev", () => {
      assert.assertEquals(
        execCtx.buildCommand("dev", "dev", CUSTOM_OPTS),
        "make run",
      );
    });

    it("should use custom command for binary installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("binary", "installed", CUSTOM_OPTS),
        "foo",
      );
    });
  });
});

// =============================================================================
// resolvePathDirs()
// =============================================================================

describe("resolvePathDirs", () => {
  describe("empty and single-value inputs", () => {
    it("should return empty array for empty string on linux", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "linux"), []);
    });

    it("should return empty array for empty string on darwin", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "darwin"), []);
    });

    it("should return empty array for empty string on windows", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "windows"), []);
    });

    it("should handle single unix dir", () => {
      assert.assertEquals(execCtx.resolvePathDirs("/usr/bin", "linux"), [
        "/usr/bin",
      ]);
    });

    it("should handle single windows dir", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\Windows\\System32", "windows"),
        ["C:\\Windows\\System32"],
      );
    });
  });

  describe("platform-specific separators", () => {
    it("should split colon-separated unix paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "/usr/bin:/usr/local/bin:/home/user/.local/bin",
          "linux",
        ),
        ["/usr/bin", "/usr/local/bin", "/home/user/.local/bin"],
      );
    });

    it("should split semicolon-separated windows paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "C:\\Windows\\System32;C:\\bin;C:\\Users\\user\\.local",
          "windows",
        ),
        ["C:\\Windows\\System32", "C:\\bin", "C:\\Users\\user\\.local"],
      );
    });

    it("should use colon separator for darwin", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin:/opt/homebrew/bin", "darwin"),
        ["/usr/bin", "/opt/homebrew/bin"],
      );
    });

    it("should not split colons in windows paths (uses semicolons)", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\Windows:D:\\bin", "windows"),
        ["C:\\Windows:D:\\bin"],
      );
    });
  });

  describe("empty segment filtering", () => {
    it("should filter empty segments from double colons", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin::/usr/local/bin", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });

    it("should filter empty segments from double semicolons", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\bin;;C:\\usr", "windows"),
        ["C:\\bin", "C:\\usr"],
      );
    });

    it("should filter leading separator", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(":/usr/bin:/usr/local/bin", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });

    it("should filter trailing separator", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin:/usr/local/bin:", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });
  });

  describe("real-world PATH patterns", () => {
    it("should handle nvm-style paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "/home/user/.nvm/versions/node/v20.0.0/bin:/usr/bin",
          "linux",
        ),
        ["/home/user/.nvm/versions/node/v20.0.0/bin", "/usr/bin"],
      );
    });

    it("should handle homebrew + system paths on macOS", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
          "darwin",
        ),
        ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"],
      );
    });
  });
});

// =============================================================================
// matchCliPrefix() — pure function tests
// =============================================================================

const SUBS = ["noskills", "nos"] as const;

describe("matchCliPrefix", () => {
  describe("exact match: subcommand as standalone argv element", () => {
    it("should handle: noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["noskills", "init"]),
        "noskills",
      );
    });

    it("should handle: eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    it("should handle: eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "nos", "init"]),
        "eser nos",
      );
    });

    it("should handle: npx noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "noskills", "init"]),
        "npx noskills",
      );
    });

    it("should handle: npx eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "eser", "noskills", "init"]),
        "npx eser noskills",
      );
    });

    it("should handle: npx eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "eser", "nos", "init"]),
        "npx eser nos",
      );
    });

    it("should handle: pnpx eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpx", "eser", "noskills", "init"]),
        "pnpx eser noskills",
      );
    });

    it("should handle: bunx eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["bunx", "eser", "nos", "init"]),
        "bunx eser nos",
      );
    });

    it("should handle: deno run -A jsr:@eser/cli noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "deno",
          "run",
          "-A",
          "jsr:@eser/cli",
          "noskills",
          "init",
        ]),
        "deno run -A jsr:@eser/cli noskills",
      );
    });

    it("should handle: deno -A npm:eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["deno", "-A", "npm:eser", "nos", "init"]),
        "deno -A npm:eser nos",
      );
    });

    it("should handle: deno task cli noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "deno",
          "task",
          "cli",
          "noskills",
          "init",
        ]),
        "deno task cli noskills",
      );
    });

    it("should handle: deno task cli nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["deno", "task", "cli", "nos", "init"]),
        "deno task cli nos",
      );
    });

    it("should handle: dx eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["dx", "eser", "noskills", "init"]),
        "dx eser noskills",
      );
    });

    it("should handle: deno x eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["deno", "x", "eser", "nos", "init"]),
        "deno x eser nos",
      );
    });

    it("should prefer first matching alias (noskills over nos)", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    it("should match second alias when first not present", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "nos", "init"]),
        "eser nos",
      );
    });
  });

  describe("embedded match: subcommand in path or package specifier", () => {
    it("should handle: deno run -A npm:noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "deno",
          "run",
          "-A",
          "npm:noskills",
          "init",
        ]),
        "deno run -A npm:noskills",
      );
    });

    it("should handle: deno -A npm:noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["deno", "-A", "npm:noskills", "init"]),
        "deno -A npm:noskills",
      );
    });

    it("should handle: deno run -A jsr:@eser/noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "deno",
          "run",
          "-A",
          "jsr:@eser/noskills",
          "init",
        ]),
        "deno run -A jsr:@eser/noskills",
      );
    });

    it("should handle: deno -A jsr:@eser/nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(["noskills", "nos"], [
          "deno",
          "-A",
          "jsr:@eser/nos",
          "init",
        ]),
        "deno -A jsr:@eser/nos",
      );
    });

    it("should match /path/to/noskills in argv", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["/usr/local/bin/noskills", "init"]),
        "/usr/local/bin/noskills",
      );
    });

    it("should match Windows backslash path", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "C:\\Users\\user\\bin\\noskills",
          "init",
        ]),
        "C:\\Users\\user\\bin\\noskills",
      );
    });

    it("should match script path with /noskills suffix via npx", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "/usr/bin/node",
          "/home/user/.npm/_npx/abc/node_modules/.bin/noskills",
          "init",
        ]),
        "/usr/bin/node /home/user/.npm/_npx/abc/node_modules/.bin/noskills",
      );
    });

    it("should match npm:noskills colon specifier", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["deno", "run", "npm:noskills", "init"]),
        "deno run npm:noskills",
      );
    });
  });

  describe("no match → undefined", () => {
    it("should return undefined when no subcommand found", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "kit", "add", "react"]),
        undefined,
      );
    });

    it("should return undefined for empty argv", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, []),
        undefined,
      );
    });

    it("should return undefined for unrelated commands", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "version", "--json"]),
        undefined,
      );
    });
  });

  describe("edge cases", () => {
    it("should not false-positive on partial matches like 'noskills-extra'", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "noskills-extra", "init"]),
        undefined,
      );
    });

    it("should handle single subcommand alias", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(["noskills"], ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    it("should handle many subcommand aliases", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(["noskills", "nos", "ns", "nsk"], [
          "eser",
          "ns",
          "init",
        ]),
        "eser ns",
      );
    });

    it("should handle single-element argv that is the subcommand", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["noskills"]),
        "noskills",
      );
    });
  });
});

// =============================================================================
// Integration tests (async — use real filesystem / environment)
// =============================================================================

describe("isCommandInPath", () => {
  it("should find deno in PATH", async () => {
    const result = await execCtx.isCommandInPath("deno");
    assert.assertEquals(result, true);
  });

  it("should return false for nonexistent binary", async () => {
    const result = await execCtx.isCommandInPath(
      "nonexistent-binary-eser-xyz-99",
    );
    assert.assertEquals(result, false);
  });
});

describe("getCliPrefix", () => {
  it("should return a string when subcommand is not in argv", async () => {
    // When running `deno test`, "noskills" won't be in argv — returns undefined
    const result = await execCtx.getCliPrefix(ESER_OPTS, ["noskills", "nos"]);
    assert.assertEquals(result, undefined);
  });

  it("should return undefined for empty subcommands list", async () => {
    const result = await execCtx.getCliPrefix(ESER_OPTS, []);
    assert.assertEquals(result, undefined);
  });

  it("should use execution context command as base", async () => {
    // When subcommand IS in argv (e.g., test runner args), the prefix
    // should start with the detected command from execution context
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    // "test" is typically in deno test argv
    const result = await execCtx.getCliPrefix(ESER_OPTS, ["test"]);
    if (result !== undefined) {
      assert.assert(result.startsWith(ctx.command));
    }
  });
});

describe("detectExecutionContext", () => {
  it("should return valid context with all required fields", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);

    assert.assertExists(ctx.runtime);
    assert.assertExists(ctx.mode);
    assert.assertExists(ctx.invoker);
    assert.assertExists(ctx.command);
    assert.assertEquals(typeof ctx.isInPath, "boolean");

    const validRuntimes: execCtx.CliRuntime[] = [
      "deno",
      "node",
      "bun",
      "compiled",
    ];
    const validModes: execCtx.CliMode[] = ["installed", "on-demand", "dev"];
    const validInvokers: execCtx.CliInvoker[] = [
      "binary",
      "deno",
      "npm",
      "npx",
      "pnpm",
      "pnpx",
      "bun",
      "bunx",
      "dev",
      "unknown",
    ];

    assert.assert(validRuntimes.includes(ctx.runtime));
    assert.assert(validModes.includes(ctx.mode));
    assert.assert(validInvokers.includes(ctx.invoker));
    assert.assert(ctx.command.length > 0);
  });

  it("should detect Deno runtime when running under Deno", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    assert.assertEquals(ctx.runtime, "deno");
  });

  it("should produce a non-empty command string", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    assert.assert(ctx.command.length > 0);
    const validPatterns = [
      "eser",
      "npx eser",
      "pnpx eser",
      "bunx eser",
      "deno run --allow-all jsr:@eser/cli",
      "deno task cli",
    ];
    assert.assert(
      validPatterns.includes(ctx.command),
      `Expected one of ${validPatterns.join(", ")}, got: ${ctx.command}`,
    );
  });
});
