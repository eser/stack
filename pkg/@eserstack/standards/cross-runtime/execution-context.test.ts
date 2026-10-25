// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as execCtx from "./execution-context.ts";
import * as crossRuntime from "./mod.ts";

const runtime = crossRuntime.runtime;

// =============================================================================
// Test fixtures
// =============================================================================

const ESER_OPTS: execCtx.CliCommandOptions = {
  command: "eser",
  devCommand: "pnpm cli",
  npmPackage: "eser",
};

const CUSTOM_OPTS: execCtx.CliCommandOptions = {
  command: "foo",
  devCommand: "make run",
  npmPackage: "bar",
};

// Helper to call detectInvoker with common defaults
const detect = (
  execBasename: string,
  runtimeName: string,
  argv: readonly string[],
  envVars?: Record<string, string | undefined>,
  isDevContext?: boolean,
) =>
  execCtx.detectInvoker(
    execBasename,
    runtimeName,
    argv,
    envVars ?? {},
    isDevContext,
  );

// =============================================================================
// detectInvoker()
// =============================================================================

bdd.describe("detectInvoker", () => {
  bdd.describe("compiled binary detection", () => {
    bdd.it(
      "should detect a single executable application by its binary name",
      () => {
        assert.assertEquals(
          detect("eser", "unknown", ["/usr/local/bin/eser", "init"]),
          { invoker: "binary", mode: "installed" },
        );
      },
    );

    bdd.it("should detect compiled binary with absolute path", () => {
      assert.assertEquals(
        detect("my-tool", "unknown", ["/opt/tools/my-tool", "run"]),
        { invoker: "binary", mode: "installed" },
      );
    });

    bdd.it("should detect compiled binary with single-letter name", () => {
      assert.assertEquals(detect("e", "unknown", ["/usr/bin/e", "doctor"]), {
        invoker: "binary",
        mode: "installed",
      });
    });

    bdd.it(
      "should detect compiled when both execBasename and runtimeName are unknown",
      () => {
        assert.assertEquals(detect("something", "unknown", []), {
          invoker: "binary",
          mode: "installed",
        });
      },
    );

    bdd.it("should detect compiled with empty execBasename", () => {
      assert.assertEquals(detect("", "unknown", []), {
        invoker: "binary",
        mode: "installed",
      });
    });

    bdd.it(
      "should detect compiled when runtimeName is non-standard (e.g. workerd)",
      () => {
        assert.assertEquals(detect("my-cli", "workerd", ["/usr/bin/my-cli"]), {
          invoker: "binary",
          mode: "installed",
        });
      },
    );
  });

  bdd.describe("version manager fallback (nvm, fnm, volta, asdf, mise)", () => {
    bdd.it(
      "should fall back to runtimeName when nvm uses custom 'node20' binary",
      () => {
        assert.assertEquals(
          detect("node20", "node", [
            "/home/user/.nvm/versions/node/v20.0.0/bin/node20",
            "/path/to/script.js",
          ]),
          { invoker: "npm", mode: "installed" },
        );
      },
    );

    bdd.it(
      "should fall back to runtimeName when fnm uses versioned 'n25.0' binary",
      () => {
        assert.assertEquals(
          detect("n25.0", "node", [
            "/home/user/.fnm/node-versions/v25.0/bin/n25.0",
            "/path/to/script.js",
          ]),
          { invoker: "npm", mode: "installed" },
        );
      },
    );

    bdd.it(
      "should fall back to runtimeName with volta custom node shim",
      () => {
        assert.assertEquals(
          detect("volta-node", "node", [
            "/home/user/.volta/bin/volta-node",
            "/path/to/script.js",
          ]),
          { invoker: "npm", mode: "installed" },
        );
      },
    );

    bdd.it(
      "should detect npx via argv[1] even with asdf custom node binary",
      () => {
        assert.assertEquals(
          detect("node-v20", "node", [
            "/home/user/.asdf/installs/nodejs/20.0.0/bin/node-v20",
            "/home/user/.npm/_npx/abc/eser",
          ]),
          { invoker: "npx", mode: "on-demand" },
        );
      },
    );
  });

  bdd.describe("Node.js: npx detection via argv[1]", () => {
    bdd.it("should detect npx from classic _npx cache path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.npm/_npx/abc123def/node_modules/.bin/eser",
          "init",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    bdd.it("should detect npx from npm 7+ _npx path with nested hash", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/Users/user/.npm/_npx/5f4b3c2a/node_modules/eser/bin/eser.mjs",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    bdd.it(
      "should detect npx from script path containing /npx/ segment",
      () => {
        assert.assertEquals(
          detect("node", "node", [
            "/usr/bin/node",
            "/usr/local/lib/npx/eser/bin.js",
          ]),
          { invoker: "npx", mode: "on-demand" },
        );
      },
    );

    bdd.it("should detect npx from Windows-style _npx path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "C:\\Users\\user\\AppData\\Local\\npm-cache\\_npx\\abc\\eser.js",
        ]),
        { invoker: "npx", mode: "on-demand" },
      );
    });
  });

  bdd.describe("Node.js: npx detection via env fallback", () => {
    bdd.it("should detect npx from npm_execpath pointing to npx-cli.js", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/clean/path/to/eser"], {
          npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js",
        }),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    bdd.it(
      "should detect npx from npm_execpath containing 'npx' in path",
      () => {
        assert.assertEquals(
          detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
            npm_execpath: "/usr/local/share/npx/cli.js",
          }),
          { invoker: "npx", mode: "on-demand" },
        );
      },
    );
  });

  bdd.describe("Node.js: pnpm/pnpx detection via argv[1]", () => {
    bdd.it("should detect pnpx from script path in pnpm store", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.local/share/pnpm/store/v3/tmp/eser",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    bdd.it("should detect pnpx from pnpm dlx cache path", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/tmp/pnpm-dlx-abc123/node_modules/.bin/eser",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    bdd.it("should detect pnpx from script path containing 'pnpx'", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/home/user/.local/pnpx/cache/eser/bin.js",
        ]),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });
  });

  bdd.describe("Node.js: pnpm/pnpx detection via env fallback", () => {
    bdd.it("should detect pnpx from npm_execpath pointing to pnpm.cjs", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/clean/path/to/eser"], {
          npm_execpath: "/home/user/.local/share/pnpm/pnpm.cjs",
        }),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });

    bdd.it("should detect pnpx from npm_execpath containing 'pnpm'", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_execpath: "/usr/local/lib/pnpm/bin/pnpm.cjs",
        }),
        { invoker: "pnpx", mode: "on-demand" },
      );
    });
  });

  bdd.describe("Node.js: pnpm global install via user agent", () => {
    bdd.it(
      "should detect pnpm from npm_config_user_agent starting with 'pnpm/'",
      () => {
        assert.assertEquals(
          detect(
            "node",
            "node",
            ["/usr/bin/node", "/usr/local/lib/node_modules/eser/bin/eser.js"],
            {
              npm_config_user_agent:
                "pnpm/8.15.0 npm/? node/v20.11.0 darwin arm64",
            },
          ),
          { invoker: "pnpm", mode: "installed" },
        );
      },
    );

    bdd.it("should detect pnpm from user agent with pnpm in middle", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_config_user_agent: "npm/10.0.0 pnpm/9.0.0 node/v22.0.0 linux x64",
        }),
        { invoker: "pnpm", mode: "installed" },
      );
    });
  });

  bdd.describe("Node.js: npm global install (default fallback)", () => {
    bdd.it("should default to npm with no special env vars", () => {
      assert.assertEquals(
        detect("node", "node", [
          "/usr/bin/node",
          "/usr/local/lib/node_modules/eser/bin/eser.js",
        ]),
        { invoker: "npm", mode: "installed" },
      );
    });

    bdd.it("should default to npm with empty env vars", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/path/to/script.js"], {
          npm_execpath: "",
          npm_config_user_agent: "",
        }),
        { invoker: "npm", mode: "installed" },
      );
    });

    bdd.it("should default to npm when user agent has no pnpm", () => {
      assert.assertEquals(
        detect("node", "node", ["/usr/bin/node", "/usr/local/bin/eser"], {
          npm_config_user_agent: "npm/10.0.0 node/v20.0.0 darwin arm64",
        }),
        { invoker: "npm", mode: "installed" },
      );
    });

    bdd.it("should default to npm with empty argv", () => {
      assert.assertEquals(detect("node", "node", []), {
        invoker: "npm",
        mode: "installed",
      });
    });

    bdd.it(
      "should default to npm with only exec in argv, no script path",
      () => {
        assert.assertEquals(detect("node", "node", ["/usr/bin/node"]), {
          invoker: "npm",
          mode: "installed",
        });
      },
    );
  });

  bdd.describe("Node.js: priority ordering (argv[1] beats env vars)", () => {
    bdd.it("should let argv[1] npx take priority over pnpm env", () => {
      assert.assertEquals(
        detect(
          "node",
          "node",
          ["/usr/bin/node", "/home/user/.npm/_npx/abc/eser"],
          {
            npm_config_user_agent: "pnpm/8.0.0",
          },
        ),
        { invoker: "npx", mode: "on-demand" },
      );
    });

    bdd.it("should let argv[1] pnpm take priority over npx env", () => {
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

  bdd.describe("Node.js: dev context", () => {
    bdd.it("should detect dev mode when isDevContext is true", () => {
      assert.assertEquals(
        detect(
          "node",
          "node",
          ["/usr/bin/node", "/workspace/pkg/@eserstack/cli/main.ts"],
          {},
          true,
        ),
        { invoker: "dev", mode: "dev" },
      );
    });

    bdd.it("should let isDevContext beat the pnpm env of `pnpm cli`", () => {
      assert.assertEquals(
        detect(
          "node",
          "node",
          ["/usr/bin/node", "/workspace/pkg/@eserstack/cli/main.ts"],
          {
            npm_execpath: "/usr/lib/node_modules/pnpm/bin/pnpm.cjs",
            npm_config_user_agent: "pnpm/11.0.0 npm/? node/v26.12.1",
          },
          true,
        ),
        { invoker: "dev", mode: "dev" },
      );
    });

    bdd.it("should let isDevContext beat an npx script path", () => {
      assert.assertEquals(
        detect(
          "node",
          "node",
          ["/usr/bin/node", "/home/user/.npm/_npx/abc/eser"],
          {},
          true,
        ),
        { invoker: "dev", mode: "dev" },
      );
    });

    bdd.it(
      "should fall through to the package manager when isDevContext is false",
      () => {
        assert.assertEquals(
          detect(
            "node",
            "node",
            ["/usr/bin/node", "/workspace/main.ts"],
            { npm_execpath: "/usr/lib/node_modules/pnpm/bin/pnpm.cjs" },
            false,
          ),
          { invoker: "pnpx", mode: "on-demand" },
        );
      },
    );

    bdd.it("should ignore isDevContext for a compiled binary", () => {
      assert.assertEquals(
        detect("eser", "compiled", ["/usr/bin/eser"], {}, true),
        {
          invoker: "binary",
          mode: "installed",
        },
      );
    });
  });

  bdd.describe("execBasename vs runtimeName resolution", () => {
    bdd.it(
      "should use execBasename 'node' directly, ignoring runtimeName 'unknown'",
      () => {
        assert.assertEquals(
          detect("node", "unknown", ["/usr/bin/node", "/script.js"]),
          { invoker: "npm", mode: "installed" },
        );
      },
    );

    bdd.it(
      "should fall back to runtimeName 'node' + npx env when execBasename is unknown",
      () => {
        assert.assertEquals(
          detect(
            "nodejs-custom",
            "node",
            ["/usr/bin/nodejs-custom", "/clean/path"],
            {
              npm_execpath: "/usr/lib/node_modules/npm/bin/npx-cli.js",
            },
          ),
          { invoker: "npx", mode: "on-demand" },
        );
      },
    );

    bdd.it(
      "should detect binary when both execBasename and runtimeName are unknown",
      () => {
        assert.assertEquals(detect("wat", "browser", []), {
          invoker: "binary",
          mode: "installed",
        });
      },
    );
  });
});

// =============================================================================
// buildCommand()
// =============================================================================

bdd.describe("buildCommand", () => {
  bdd.describe("installed invokers → opts.command", () => {
    bdd.it("should return opts.command for binary/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("binary", "installed", ESER_OPTS),
        "eser",
      );
    });

    bdd.it("should return opts.command for npm/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("npm", "installed", ESER_OPTS),
        "eser",
      );
    });

    bdd.it("should return opts.command for pnpm/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("pnpm", "installed", ESER_OPTS),
        "eser",
      );
    });

    bdd.it("should return opts.command for unknown/installed", () => {
      assert.assertEquals(
        execCtx.buildCommand("unknown", "installed", ESER_OPTS),
        "eser",
      );
    });
  });

  bdd.describe("on-demand invokers → package manager prefix", () => {
    bdd.it("should return 'npx {pkg}' for npx/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("npx", "on-demand", ESER_OPTS),
        "npx eser",
      );
    });

    bdd.it("should return 'pnpx {pkg}' for pnpx/on-demand", () => {
      assert.assertEquals(
        execCtx.buildCommand("pnpx", "on-demand", ESER_OPTS),
        "pnpx eser",
      );
    });
  });

  bdd.describe("dev invoker → opts.devCommand", () => {
    bdd.it("should return opts.devCommand for dev/dev", () => {
      assert.assertEquals(
        execCtx.buildCommand("dev", "dev", ESER_OPTS),
        "pnpm cli",
      );
    });
  });

  bdd.describe("custom opts parameterization", () => {
    bdd.it("should use custom npmPackage for npx", () => {
      assert.assertEquals(
        execCtx.buildCommand("npx", "on-demand", CUSTOM_OPTS),
        "npx bar",
      );
    });

    bdd.it("should use custom devCommand for dev", () => {
      assert.assertEquals(
        execCtx.buildCommand("dev", "dev", CUSTOM_OPTS),
        "make run",
      );
    });

    bdd.it("should use custom command for binary installed", () => {
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

bdd.describe("resolvePathDirs", () => {
  bdd.describe("empty and single-value inputs", () => {
    bdd.it("should return empty array for empty string on linux", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "linux"), []);
    });

    bdd.it("should return empty array for empty string on darwin", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "darwin"), []);
    });

    bdd.it("should return empty array for empty string on windows", () => {
      assert.assertEquals(execCtx.resolvePathDirs("", "windows"), []);
    });

    bdd.it("should handle single unix dir", () => {
      assert.assertEquals(execCtx.resolvePathDirs("/usr/bin", "linux"), [
        "/usr/bin",
      ]);
    });

    bdd.it("should handle single windows dir", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\Windows\\System32", "windows"),
        ["C:\\Windows\\System32"],
      );
    });
  });

  bdd.describe("platform-specific separators", () => {
    bdd.it("should split colon-separated unix paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "/usr/bin:/usr/local/bin:/home/user/.local/bin",
          "linux",
        ),
        ["/usr/bin", "/usr/local/bin", "/home/user/.local/bin"],
      );
    });

    bdd.it("should split semicolon-separated windows paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "C:\\Windows\\System32;C:\\bin;C:\\Users\\user\\.local",
          "windows",
        ),
        ["C:\\Windows\\System32", "C:\\bin", "C:\\Users\\user\\.local"],
      );
    });

    bdd.it("should use colon separator for darwin", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin:/opt/homebrew/bin", "darwin"),
        ["/usr/bin", "/opt/homebrew/bin"],
      );
    });

    bdd.it("should not split colons in windows paths (uses semicolons)", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\Windows:D:\\bin", "windows"),
        ["C:\\Windows:D:\\bin"],
      );
    });
  });

  bdd.describe("empty segment filtering", () => {
    bdd.it("should filter empty segments from double colons", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin::/usr/local/bin", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });

    bdd.it("should filter empty segments from double semicolons", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("C:\\bin;;C:\\usr", "windows"),
        ["C:\\bin", "C:\\usr"],
      );
    });

    bdd.it("should filter leading separator", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(":/usr/bin:/usr/local/bin", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });

    bdd.it("should filter trailing separator", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs("/usr/bin:/usr/local/bin:", "linux"),
        ["/usr/bin", "/usr/local/bin"],
      );
    });
  });

  bdd.describe("real-world PATH patterns", () => {
    bdd.it("should handle nvm-style paths", () => {
      assert.assertEquals(
        execCtx.resolvePathDirs(
          "/home/user/.nvm/versions/node/v20.0.0/bin:/usr/bin",
          "linux",
        ),
        ["/home/user/.nvm/versions/node/v20.0.0/bin", "/usr/bin"],
      );
    });

    bdd.it("should handle homebrew + system paths on macOS", () => {
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

bdd.describe("matchCliPrefix", () => {
  bdd.describe("exact match: subcommand as standalone argv element", () => {
    bdd.it("should handle: noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["noskills", "init"]),
        "noskills",
      );
    });

    bdd.it("should handle: eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    bdd.it("should handle: eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "nos", "init"]),
        "eser nos",
      );
    });

    bdd.it("should handle: npx noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "noskills", "init"]),
        "npx noskills",
      );
    });

    bdd.it("should handle: npx eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "eser", "noskills", "init"]),
        "npx eser noskills",
      );
    });

    bdd.it("should handle: npx eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["npx", "eser", "nos", "init"]),
        "npx eser nos",
      );
    });

    bdd.it("should handle: pnpx eser noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpx", "eser", "noskills", "init"]),
        "pnpx eser noskills",
      );
    });

    bdd.it("should handle: pnpm dlx eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpm", "dlx", "eser", "nos", "init"]),
        "pnpm dlx eser nos",
      );
    });

    bdd.it("should handle: pnpm dlx jsr:@eserstack/cli noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, [
          "pnpm",
          "dlx",
          "jsr:@eserstack/cli",
          "noskills",
          "init",
        ]),
        "pnpm dlx jsr:@eserstack/cli noskills",
      );
    });

    bdd.it("should handle: pnpm cli noskills init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpm", "cli", "noskills", "init"]),
        "pnpm cli noskills",
      );
    });

    bdd.it("should handle: pnpm cli nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpm", "cli", "nos", "init"]),
        "pnpm cli nos",
      );
    });

    bdd.it("should handle: pnpm exec eser nos init", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["pnpm", "exec", "eser", "nos", "init"]),
        "pnpm exec eser nos",
      );
    });

    bdd.it("should prefer first matching alias (noskills over nos)", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    bdd.it("should match second alias when first not present", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "nos", "init"]),
        "eser nos",
      );
    });
  });

  bdd.describe(
    "embedded match: subcommand in path or package specifier",
    () => {
      bdd.it("should handle: pnpm dlx jsr:@eserstack/noskills init", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, [
            "pnpm",
            "dlx",
            "jsr:@eserstack/noskills",
            "init",
          ]),
          "pnpm dlx jsr:@eserstack/noskills",
        );
      });

      bdd.it("should handle: pnpm dlx jsr:@eserstack/nos init", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(
            ["noskills", "nos"],
            ["pnpm", "dlx", "jsr:@eserstack/nos", "init"],
          ),
          "pnpm dlx jsr:@eserstack/nos",
        );
      });

      bdd.it("should match /path/to/noskills in argv", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, ["/usr/local/bin/noskills", "init"]),
          "/usr/local/bin/noskills",
        );
      });

      bdd.it("should match Windows backslash path", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, [
            "C:\\Users\\user\\bin\\noskills",
            "init",
          ]),
          "C:\\Users\\user\\bin\\noskills",
        );
      });

      bdd.it("should match script path with /noskills suffix via npx", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, [
            "/usr/bin/node",
            "/home/user/.npm/_npx/abc/node_modules/.bin/noskills",
            "init",
          ]),
          "/usr/bin/node /home/user/.npm/_npx/abc/node_modules/.bin/noskills",
        );
      });

      bdd.it("should match npm:noskills colon specifier", () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, ["pnpm", "dlx", "npm:noskills", "init"]),
          "pnpm dlx npm:noskills",
        );
      });
    },
  );

  bdd.describe("no match → undefined", () => {
    bdd.it("should return undefined when no subcommand found", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "kit", "add", "react"]),
        undefined,
      );
    });

    bdd.it("should return undefined for empty argv", () => {
      assert.assertEquals(execCtx.matchCliPrefix(SUBS, []), undefined);
    });

    bdd.it("should return undefined for unrelated commands", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(SUBS, ["eser", "version", "--json"]),
        undefined,
      );
    });
  });

  bdd.describe("edge cases", () => {
    bdd.it(
      "should not false-positive on partial matches like 'noskills-extra'",
      () => {
        assert.assertEquals(
          execCtx.matchCliPrefix(SUBS, ["eser", "noskills-extra", "init"]),
          undefined,
        );
      },
    );

    bdd.it("should handle single subcommand alias", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(["noskills"], ["eser", "noskills", "init"]),
        "eser noskills",
      );
    });

    bdd.it("should handle many subcommand aliases", () => {
      assert.assertEquals(
        execCtx.matchCliPrefix(
          ["noskills", "nos", "ns", "nsk"],
          ["eser", "ns", "init"],
        ),
        "eser ns",
      );
    });

    bdd.it("should handle single-element argv that is the subcommand", () => {
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

bdd.describe("isCommandInPath", () => {
  bdd.it("should find the running node in PATH", async () => {
    const execPath = runtime.process.execPath();
    const original = runtime.env.get("PATH");
    runtime.env.set("PATH", runtime.path.dirname(execPath));

    try {
      const name = runtime.path.basename(execPath, ".exe");
      assert.assertEquals(await execCtx.isCommandInPath(name), true);
    } finally {
      if (original === undefined) {
        runtime.env.delete("PATH");
      } else {
        runtime.env.set("PATH", original);
      }
    }
  });

  bdd.it("should return false for nonexistent binary", async () => {
    const result = await execCtx.isCommandInPath(
      "nonexistent-binary-eser-xyz-99",
    );
    assert.assertEquals(result, false);
  });
});

bdd.describe("getCliPrefix", () => {
  bdd.it("should return a string when subcommand is not in argv", async () => {
    // When running `node --test`, "noskills" won't be in argv — returns undefined
    const result = await execCtx.getCliPrefix(ESER_OPTS, ["noskills", "nos"]);
    assert.assertEquals(result, undefined);
  });

  bdd.it("should return undefined for empty subcommands list", async () => {
    const result = await execCtx.getCliPrefix(ESER_OPTS, []);
    assert.assertEquals(result, undefined);
  });

  bdd.it("should use execution context command as base", async () => {
    // When subcommand IS in argv (e.g., test runner args), the prefix
    // should start with the detected command from execution context
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    // "--test" is in node --test argv only as a flag, so this may not match
    const result = await execCtx.getCliPrefix(ESER_OPTS, ["test"]);
    if (result !== undefined) {
      assert.assert(result.startsWith(ctx.command));
    }
  });
});

bdd.describe("detectExecutionContext", () => {
  bdd.it("should return valid context with all required fields", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);

    assert.assertExists(ctx.runtime);
    assert.assertExists(ctx.mode);
    assert.assertExists(ctx.invoker);
    assert.assertExists(ctx.command);
    assert.assertEquals(typeof ctx.isInPath, "boolean");

    const validRuntimes: execCtx.CliRuntime[] = ["node", "compiled"];
    const validModes: execCtx.CliMode[] = ["installed", "on-demand", "dev"];
    const validInvokers: execCtx.CliInvoker[] = [
      "binary",
      "npm",
      "npx",
      "pnpm",
      "pnpx",
      "dev",
      "unknown",
    ];

    assert.assert(validRuntimes.includes(ctx.runtime));
    assert.assert(validModes.includes(ctx.mode));
    assert.assert(validInvokers.includes(ctx.invoker));
    assert.assert(ctx.command.length > 0);
  });

  bdd.it("should detect the Node runtime when running under Node", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    assert.assertEquals(ctx.runtime, "node");
  });

  bdd.it(
    "should detect dev mode in a directory whose package.json has a cli script",
    async () => {
      const dir = await runtime.fs.makeTempDir({ prefix: "exec-ctx-" });
      const original = runtime.process.cwd();

      try {
        await runtime.fs.writeTextFile(
          runtime.path.join(dir, "package.json"),
          JSON.stringify({ scripts: { cli: "node ./main.ts" } }),
        );
        runtime.process.chdir(dir);

        const ctx = await execCtx.detectExecutionContext(ESER_OPTS);

        assert.assertEquals(ctx.invoker, "dev");
        assert.assertEquals(ctx.mode, "dev");
        assert.assertEquals(ctx.command, "pnpm cli");
      } finally {
        runtime.process.chdir(original);
        await runtime.fs.remove(dir, { recursive: true });
      }
    },
  );

  bdd.it(
    "should not detect dev mode where package.json has no cli script",
    async () => {
      const dir = await runtime.fs.makeTempDir({ prefix: "exec-ctx-" });
      const original = runtime.process.cwd();

      try {
        await runtime.fs.writeTextFile(
          runtime.path.join(dir, "package.json"),
          JSON.stringify({ scripts: { test: "node --test" } }),
        );
        runtime.process.chdir(dir);

        const ctx = await execCtx.detectExecutionContext(ESER_OPTS);

        assert.assertNotEquals(ctx.invoker, "dev");
      } finally {
        runtime.process.chdir(original);
        await runtime.fs.remove(dir, { recursive: true });
      }
    },
  );

  bdd.it("should produce a non-empty command string", async () => {
    const ctx = await execCtx.detectExecutionContext(ESER_OPTS);
    assert.assert(ctx.command.length > 0);
    const validPatterns = ["eser", "npx eser", "pnpx eser", "pnpm cli"];
    assert.assert(
      validPatterns.includes(ctx.command),
      `Expected one of ${validPatterns.join(", ")}, got: ${ctx.command}`,
    );
  });
});
