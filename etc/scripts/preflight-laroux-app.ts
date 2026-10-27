// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release preflight and CI smoke test of the npm package `laroux` (TASK-237):
 * a new app from the laroux-app recipe, installed from the packed packages
 * OUTSIDE the repository, must run `laroux dev`, `laroux build` and
 * `laroux serve` on Node with no config file, and load one React and one
 * action registry while it does.
 *
 * It runs after `pnpm -r build` and `pnpm -r pack` (the library-build and
 * library-pack preflight steps) and `make ajan-lib`, and:
 *
 * 1. scaffolds the laroux-app recipe of .eser/recipes.json into a scratch
 *    directory with `go run ./cmd/eser kit add`, and removes the recipe's
 *    laroux.config.ts, so the app runs on the defaults alone;
 * 2. points every dependency of the app that the pack directory has a tarball
 *    for at that tarball, adds an `overrides` map from every packed name to
 *    its tarball (the TASK-236 approach), puts the @eserstack scope on an
 *    unreachable registry and installs with npm, the way a user of the recipe
 *    installs it; the lockfile must resolve `laroux` and every @eserstack
 *    package from a tarball, and hold one copy of react, react-dom and
 *    @eserstack/laroux-server;
 * 3. runs `node --run dev`, waits for the home page, makes one edit to it and
 *    waits for the HMR update on /hmr and for the page to show the edit;
 * 4. makes the home page register a server action through
 *    @eserstack/laroux-server/action-registry, then runs `node --run build`,
 *    whose server bundle must import that registry and not inline it;
 * 5. runs `node --run serve` and fetches the home page.
 *
 * dev and serve run with a module resolve hook (module.registerHooks, loaded
 * through NODE_OPTIONS) that records every module file they load. In each,
 * react, react-dom and @eserstack/laroux-server must load from one directory
 * each, and in serve action-registry.js must load once, from the same
 * @eserstack/laroux-server the CLI runs from.
 *
 * The packed @eserstack/ajan-* platform packages carry no library, so the
 * servers load the native library that `make ajan-lib` built, through
 * ESER_AJAN_LIB_PATH (an ESER_AJAN_LIB_PATH already set wins); an installed
 * release takes it from the platform package npm picks.
 *
 * Usage:
 *   node ./etc/scripts/preflight-laroux-app.ts [--packs <dir>] [--app-dir <dir>]
 *
 * Options:
 *   --packs <dir>    Where `pnpm -r pack` wrote the tarballs, relative to the
 *                    repository root (default: etc/temp/npm-packs).
 *   --app-dir <dir>  Install the app into this new or empty directory outside
 *                    the repository and keep it, for further checks on the
 *                    same install (default: a temporary directory, removed).
 *
 * @module
 */

// The progress and result lines it prints are the preflight's log.
/* oxlint-disable no-console */

import * as childProcess from "node:child_process";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as nodeProcess from "node:process";
import * as os from "node:os";
import * as url from "node:url";
// etc/scripts belongs to no workspace package, so no import map resolves the
// bare "@eserstack/standards/cross-runtime". The cross-runtime layer imports
// no other package, so it loads by path from here.
import * as crossRuntime from "../../pkg/@eserstack/standards/cross-runtime/mod.ts";
import * as distUtils from "./dist-utils.ts";
import * as libraryConsumer from "./preflight-library-consumer.ts";

const { runtime } = crossRuntime;

const DEFAULT_PACKS_DIR = "etc/temp/npm-packs";
const PACKAGES_DIR = "pkg/@eserstack";
const RECIPE = "laroux-app";

/** The npm package of the `laroux` bin (pkg/@eserstack/laroux-bin). */
export const TOOL_PACKAGE = "laroux";

/** The package that holds the commands and the action registry. */
export const SERVER_PACKAGE = "@eserstack/laroux-server";

/** The packages that must load from one directory each. */
export const SINGLE_COPY_PACKAGES: readonly string[] = [
  "react",
  "react-dom",
  SERVER_PACKAGE,
];

/** The registry module, relative to the root of @eserstack/laroux-server. */
export const ACTION_REGISTRY_FILE = "dist/domain/action-registry.js";

/** An error text of the registry that only a copy of its code carries. */
const ACTION_REGISTRY_TEXT = "no action is registered under this id";

/** The heading of the recipe's home page, and what the HMR edit makes it. */
const HOME_TEXT = "Welcome to laroux.js";
const HMR_TEXT = "laroux smoke test: HMR edit";

/** What the home page shows once it registers a server action. */
const SERVE_TEXT = "laroux smoke test: serve";
const REGISTERED_TEXT = "registered actions: 1";

const HOME_PAGE = "src/app/routes/home/page.tsx";

/** The home page of the serve step: a server component using the registry. */
export const REGISTRY_PAGE: string = `import * as actionRegistry from "@eserstack/laroux-server/action-registry";

actionRegistry.registerAction("laroux-smoke#ping", async () => "pong");

export function HomePage() {
  return (
    <main>
      <h1>${SERVE_TEXT}</h1>
      <p>{\`registered actions: \${actionRegistry.getRegisteredActions().length}\`}</p>
    </main>
  );
}
`;

/** The env variable the resolve hook writes the loaded module URLs to. */
const MODULES_ENV = "LAROUX_SMOKE_MODULES";

/**
 * The module NODE_OPTIONS loads into every node process of a step: it appends
 * each file: URL a resolve returns to the file MODULES_ENV names, once per
 * process. registerHooks hooks are synchronous and cover import and require,
 * and an append per URL survives the process being stopped.
 */
export const RECORDER_SOURCE: string = `import * as fs from "node:fs";
import * as module from "node:module";

const target = process.env.${MODULES_ENV};
const seen = new Set();

if (target !== undefined && target !== "") {
  module.registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context);

      if (result.url.startsWith("file:") && !seen.has(result.url)) {
        seen.add(result.url);
        fs.appendFileSync(target, result.url + "\\n");
      }

      return result;
    },
  });
}
`;

/**
 * The registry the app is given for the @eserstack scope: the discard port of
 * the loopback address, where nothing listens.
 */
const UNREACHABLE_REGISTRY = libraryConsumer.UNREACHABLE_REGISTRY;

const SCAFFOLD_TIMEOUT_MS = 300_000;
const INSTALL_TIMEOUT_MS = 300_000;
const BUILD_TIMEOUT_MS = 180_000;
const SERVER_READY_TIMEOUT_MS = 120_000;
const HMR_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 500;

/** The options the check reads from its arguments. */
export type SmokeOptions = {
  readonly packsDir: string;
  readonly appDir: string | null;
};

/**
 * Reads `--packs <dir>` and `--app-dir <dir>`, in the spaced or the `=` form.
 *
 * @throws Error for an unknown argument or a missing value
 */
export const parseOptions = (args: readonly string[]): SmokeOptions => {
  let packsDir: string | null = null;
  let appDir: string | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    const [flag, inline] = arg.split(/=(.*)/s, 2);

    if (flag !== "--packs" && flag !== "--app-dir") {
      throw new Error(
        `unknown argument ${arg}; usage: preflight-laroux-app.ts [--packs <dir>] [--app-dir <dir>]`,
      );
    }

    const value = inline ?? args[(index += 1)];

    if (value === undefined || value === "") {
      throw new Error(`${flag} needs a value`);
    }

    if (flag === "--packs") {
      packsDir = value;
    } else {
      appDir = value;
    }
  }

  return { packsDir: packsDir ?? DEFAULT_PACKS_DIR, appDir };
};

/**
 * The library `make ajan-lib` builds for a host, relative to the repository
 * root: pkg/@eserstack/ajan/dist/<arch>-<os>/libeser_ajan.<ext>.
 */
export const hostAjanLibrary = (
  platform: crossRuntime.Platform,
  arch: crossRuntime.Arch,
): string => {
  const cpu = arch === "arm64" ? "aarch64" : "x86_64";
  const extension =
    platform === "darwin" ? "dylib" : platform === "windows" ? "dll" : "so";

  return `${PACKAGES_DIR}/ajan/dist/${cpu}-${platform}/libeser_ajan.${extension}`;
};

/** A package.json, as far as this script reads and writes it. */
export type AppManifest = {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly [field: string]: unknown;
};

/**
 * Points the app at the packed packages: each dependency and dev dependency
 * with a tarball gets `file:<tarball>`, and `overrides` maps every packed
 * name to its tarball, so the exact versions the packed manifests ask for
 * resolve from the pack directory too. npm refuses an override of a direct
 * dependency whose spec differs, hence the same spec in both places.
 */
export const pointAtTarballs = (
  manifest: AppManifest,
  tarballs: ReadonlyMap<string, string>,
): AppManifest => {
  const point = (
    dependencies: Readonly<Record<string, string>> | undefined,
  ): Record<string, string> | undefined =>
    dependencies === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(dependencies).map(([name, spec]) => {
            const tarball = tarballs.get(name);

            return [name, tarball === undefined ? spec : `file:${tarball}`];
          }),
        );

  return {
    ...manifest,
    dependencies: point(manifest.dependencies),
    devDependencies: point(manifest.devDependencies),
    overrides: Object.fromEntries(
      [...tarballs].map(([name, tarball]) => [name, `file:${tarball}`]),
    ),
  };
};

/** The `packages` map of an npm package-lock.json (lockfileVersion 3). */
export type PackageLock = {
  readonly packages?: Readonly<
    Record<string, { readonly resolved?: string; readonly link?: boolean }>
  >;
};

/** The package name an npm lockfile key ends with: "a/node_modules/@s/x". */
const lockKeyName = (key: string): string | null => {
  const index = key.lastIndexOf("node_modules/");

  return index === -1 ? null : key.slice(index + "node_modules/".length);
};

/**
 * The installed packages among `names` that did not come from a `file:`
 * tarball, as "<lockfile key> (<resolved>)". Empty when every one did.
 */
export const registryResolved = (
  lock: PackageLock,
  names: ReadonlySet<string>,
): string[] =>
  Object.entries(lock.packages ?? {})
    .filter(([key, entry]) => {
      const name = lockKeyName(key);

      return (
        name !== null &&
        names.has(name) &&
        entry.link !== true &&
        !(entry.resolved ?? "").startsWith("file:")
      );
    })
    .map(([key, entry]) => `${key} (${entry.resolved ?? "no resolved field"})`)
    .sort();

/** Every place a package is installed in the lockfile, by package name. */
export const installedCopies = (
  lock: PackageLock,
  names: readonly string[],
): Map<string, string[]> => {
  const copies = new Map<string, string[]>(names.map((name) => [name, []]));

  for (const key of Object.keys(lock.packages ?? {})) {
    const name = lockKeyName(key);

    if (name !== null) {
      copies.get(name)?.push(key);
    }
  }

  return copies;
};

/**
 * The package a module file belongs to, from the last node_modules segment
 * of its path: "/a/node_modules/@s/x/dist/m.js" is @s/x at
 * "/a/node_modules/@s/x" with "dist/m.js" inside it. Null outside
 * node_modules.
 */
export const packageOf = (
  path: string,
): { name: string; root: string; file: string } | null => {
  const marker = "/node_modules/";
  const index = path.lastIndexOf(marker);

  if (index === -1) {
    return null;
  }

  const rest = path.slice(index + marker.length).split("/");
  const nameParts = rest[0]?.startsWith("@") === true ? 2 : 1;

  if (rest.length <= nameParts) {
    return null;
  }

  const name = rest.slice(0, nameParts).join("/");

  return {
    name,
    root: `${path.slice(0, index + marker.length)}${name}`,
    file: rest.slice(nameParts).join("/"),
  };
};

/** What a run-time check asks of the recorded modules. */
export type InstanceRules = {
  /** Packages that must have loaded, from exactly one directory. */
  readonly required: readonly string[];
  /** Whether action-registry.js must have loaded, once. */
  readonly registry: boolean;
};

/**
 * Checks the module files one process loaded (file: URLs, queries allowed):
 * every package of SINGLE_COPY_PACKAGES loads from at most one directory, the
 * `required` ones from exactly one, and action-registry.js from at most one
 * file, inside that @eserstack/laroux-server, or exactly one with `registry`.
 *
 * @returns One line per problem; empty when the modules pass
 */
export const instanceProblems = (
  moduleUrls: readonly string[],
  rules: InstanceRules,
): string[] => {
  const roots = new Map<string, Set<string>>(
    SINGLE_COPY_PACKAGES.map((name) => [name, new Set()]),
  );
  const registryFiles = new Set<string>();

  for (const moduleUrl of moduleUrls) {
    if (!moduleUrl.startsWith("file:")) {
      continue;
    }

    const path = url.fileURLToPath(moduleUrl.replace(/[?#].*$/s, ""));
    const owner = packageOf(path.replaceAll("\\", "/"));

    if (owner === null) {
      continue;
    }

    roots.get(owner.name)?.add(owner.root);

    if (owner.name === SERVER_PACKAGE && owner.file === ACTION_REGISTRY_FILE) {
      registryFiles.add(`${owner.root}/${owner.file}`);
    }
  }

  const problems: string[] = [];

  for (const [name, dirs] of roots) {
    if (dirs.size > 1) {
      problems.push(
        `${name} loaded from ${dirs.size} directories: ${[...dirs].join(", ")}`,
      );
    } else if (dirs.size === 0 && rules.required.includes(name)) {
      problems.push(`${name} never loaded, so its single copy is unproven`);
    }
  }

  const [serverRoot] = roots.get(SERVER_PACKAGE) ?? [];

  if (registryFiles.size > 1) {
    problems.push(
      `the action registry loaded from ${registryFiles.size} files: ${[...registryFiles].join(", ")}`,
    );
  } else if (registryFiles.size === 0 && rules.registry) {
    problems.push(`${ACTION_REGISTRY_FILE} of ${SERVER_PACKAGE} never loaded`);
  }

  for (const file of registryFiles) {
    if (serverRoot !== undefined && !file.startsWith(`${serverRoot}/`)) {
      problems.push(
        `the action registry ${file} is not in the ${SERVER_PACKAGE} the CLI runs from (${serverRoot})`,
      );
    }
  }

  return problems;
};

// =============================================================================
// Steps
// =============================================================================

/** Whether an error is a missing file. */
const isNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** A finished command: its exit code and its output. */
type RunResult = { readonly code: number; readonly output: string };

/** Runs a command to completion and fails with its output when it fails. */
const run = async (
  cmd: string,
  args: readonly string[],
  cwd: string,
  timeoutMs: number,
  env: Readonly<Record<string, string>> = {},
): Promise<RunResult> => {
  const result = await runtime.exec.spawn(cmd, [...args], {
    cwd,
    env: { ...env },
    stdout: "piped",
    stderr: "piped",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const decoder = new TextDecoder();
  const output = `${decoder.decode(result.stdout)}${decoder.decode(result.stderr)}`;

  if (!result.success) {
    throw new Error(
      `${[cmd, ...args].join(" ")} in ${cwd} exited with code ${result.code}:\n${output}`,
    );
  }

  return { code: result.code, output };
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** A port nothing listens on right now, from the OS. */
const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address !== null ? address.port : 0;

      server.close(() => resolve(port));
    });
  });

/** A long-running server process and the output it wrote so far. */
type ServerProcess = {
  readonly child: childProcess.ChildProcess;
  readonly output: () => string;
  readonly exited: Promise<number | null>;
};

/**
 * Starts `node --run <script> -- --port <port>` in its own process group, so
 * stopping it also stops the shell and the laroux process `node --run`
 * starts.
 */
const startScript = (
  script: string,
  port: number,
  cwd: string,
  env: Readonly<Record<string, string>>,
): ServerProcess => {
  const chunks: string[] = [];
  const child = childProcess.spawn(
    runtime.process.execPath(),
    ["--run", script, "--", "--port", String(port)],
    {
      cwd,
      env: { ...runtime.env.toObject(), ...env },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

  const exited = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => resolve(code));
  });

  return { child, output: () => chunks.join(""), exited };
};

/** Stops a server's process group: SIGTERM, then SIGKILL if it lingers. */
const stopScript = async (server: ServerProcess): Promise<void> => {
  const pid = server.child.pid;

  if (pid === undefined || server.child.exitCode !== null) {
    return;
  }

  const signalGroup = (signal: NodeJS.Signals): void => {
    try {
      nodeProcess.kill(-pid, signal);
    } catch (error) {
      // The group is gone already.
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      ) {
        throw error;
      }
    }
  };

  signalGroup("SIGTERM");

  const stopped = await withTimeout(
    server.exited.then(() => true),
    STOP_TIMEOUT_MS,
    () => "",
  ).catch(() => false);

  // The shell may exit before the laroux process does, so the group gets
  // SIGKILL whether or not the direct child has gone.
  signalGroup("SIGKILL");

  if (!stopped) {
    await server.exited;
  }
};

/** Fetches a page's text, or null while the server is not answering yet. */
const fetchText = async (
  pageUrl: string,
): Promise<{ status: number; text: string } | null> => {
  try {
    const response = await fetch(pageUrl, {
      signal: AbortSignal.timeout(30_000),
    });

    return { status: response.status, text: await response.text() };
  } catch {
    return null;
  }
};

/**
 * Polls a page until it answers 200 with `expected` in its text.
 *
 * @throws Error with the server's output when the server exits or the time
 * runs out first
 */
const waitForPage = async (
  server: ServerProcess,
  pageUrl: string,
  expected: string,
  what: string,
): Promise<void> => {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  let last = "no answer";

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `${what}: the server exited with code ${server.child.exitCode} before ${pageUrl} showed "${expected}":\n${server.output()}`,
      );
    }

    // oxlint-disable-next-line no-await-in-loop
    const page = await fetchText(pageUrl);

    if (page !== null && page.status === 200 && page.text.includes(expected)) {
      return;
    }

    last =
      page === null
        ? "no answer"
        : `status ${page.status}: ${page.text.slice(0, 200)}`;
    // oxlint-disable-next-line no-await-in-loop
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `${what}: ${pageUrl} did not show "${expected}" within ${SERVER_READY_TIMEOUT_MS} ms (last: ${last}):\n${server.output()}`,
  );
};

/** The module URLs a step's processes recorded, without repeats. */
const readModules = async (path: string): Promise<string[]> => {
  try {
    const text = await fs.readFile(path, "utf8");

    return [...new Set(text.split("\n").filter((line) => line !== ""))];
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }
};

const checkInstances = async (
  modulesFile: string,
  rules: InstanceRules,
  what: string,
): Promise<void> => {
  const modules = await readModules(modulesFile);
  const problems = instanceProblems(modules, rules);

  if (problems.length > 0) {
    throw new Error(`${what}:\n  ${problems.join("\n  ")}`);
  }

  console.log(
    `${what}: ${modules.length} module files, one react, one react-dom and one ${SERVER_PACKAGE}${rules.registry ? ", one action registry" : ""}`,
  );
};

/** The name and tarball of one package directory, or null without either. */
const packedTarball = async (
  pkgDir: string,
  packsDir: string,
): Promise<readonly [string, string] | null> => {
  let manifest: { name?: string; version?: string };

  try {
    manifest = JSON.parse(
      await fs.readFile(`${pkgDir}/package.json`, "utf8"),
    ) as { name?: string; version?: string };
  } catch (error) {
    // directives/ holds documents only and has no package.json.
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }

  const name = manifest.name ?? "";
  const tarball = `${packsDir}/${libraryConsumer.tarballName(
    name,
    manifest.version ?? "",
  )}`;

  try {
    await fs.stat(tarball);
  } catch (error) {
    // A private package that library-pack did not pack.
    if (isNotFound(error)) {
      return null;
    }
    throw error;
  }

  return [name, tarball];
};

/** Every workspace package with a tarball in the pack directory. */
const packedTarballs = async (
  repoRoot: string,
  packsDir: string,
): Promise<Map<string, string>> => {
  const pkgRoot = `${repoRoot}/${PACKAGES_DIR}`;
  const entries = await fs.readdir(pkgRoot, { withFileTypes: true });
  const found = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        packedTarball(`${pkgRoot}/${entry.name}`, `${repoRoot}/${packsDir}`),
      ),
  );
  const tarballs = new Map(found.filter((pair) => pair !== null));

  for (const name of [TOOL_PACKAGE, SERVER_PACKAGE]) {
    if (!tarballs.has(name)) {
      throw new Error(
        `no tarball of ${name} in ${packsDir}; run pnpm -r build and pnpm -r --filter "./pkg/@eserstack/*" pack --pack-destination ${packsDir} first`,
      );
    }
  }

  return tarballs;
};

/** The native library the servers load, from the env or `make ajan-lib`. */
const ajanLibrary = async (repoRoot: string): Promise<string> => {
  const fromEnv = runtime.env.get("ESER_AJAN_LIB_PATH");

  if (fromEnv !== undefined && fromEnv !== "") {
    return fromEnv;
  }

  const library = `${repoRoot}/${hostAjanLibrary(
    crossRuntime.getPlatform(),
    crossRuntime.getArch(),
  )}`;

  try {
    await fs.stat(library);
  } catch (error) {
    if (isNotFound(error)) {
      throw new Error(
        `${library} is missing; run make ajan-lib first, or set ESER_AJAN_LIB_PATH`,
        { cause: error },
      );
    }
    throw error;
  }

  return library;
};

/** The app directory: the one asked for, which must be new or empty. */
const prepareAppDir = async (
  repoRoot: string,
  appDir: string | null,
): Promise<string> => {
  if (appDir === null) {
    // Under the OS temp dir, never under the repo: there Node would resolve
    // a dependency the tarballs lack from the workspace's node_modules.
    return await fs.mkdtemp(`${os.tmpdir()}/laroux-app-`);
  }

  const dir = runtime.path.resolve(appDir);

  if (`${dir}/`.startsWith(`${runtime.path.resolve(repoRoot)}/`)) {
    throw new Error(
      `--app-dir ${appDir} is inside the repository, where the app would resolve the workspace's node_modules; pick a directory outside it`,
    );
  }

  await fs.mkdir(dir, { recursive: true });

  if ((await fs.readdir(dir)).length > 0) {
    throw new Error(`--app-dir ${appDir} is not empty`);
  }

  return dir;
};

const scaffold = async (repoRoot: string, appDir: string): Promise<void> => {
  console.log(`Scaffolding the ${RECIPE} recipe into ${appDir} ...`);
  await run(
    "go",
    [
      "run",
      "./cmd/eser",
      "kit",
      "add",
      RECIPE,
      "--registry",
      `${repoRoot}/.eser/recipes.json`,
      "--cwd",
      appDir,
      "--no-install",
      "--var",
      "project_name=laroux-smoke",
    ],
    repoRoot,
    SCAFFOLD_TIMEOUT_MS,
  );

  // No config file: the app runs on the defaults alone.
  await fs.rm(`${appDir}/laroux.config.ts`, { force: true });
};

const install = async (
  appDir: string,
  tarballs: ReadonlyMap<string, string>,
): Promise<void> => {
  const manifestPath = `${appDir}/package.json`;
  const manifest = JSON.parse(
    await fs.readFile(manifestPath, "utf8"),
  ) as AppManifest;

  await fs.writeFile(
    manifestPath,
    `${JSON.stringify(pointAtTarballs(manifest, tarballs), null, 2)}\n`,
  );
  await fs.writeFile(
    `${appDir}/.npmrc`,
    `@eserstack:registry=${UNREACHABLE_REGISTRY}\n`,
  );

  console.log(
    `Installing the app with npm, ${tarballs.size} packages from their tarballs ...`,
  );
  await run(
    "npm",
    ["install", "--no-audit", "--no-fund"],
    appDir,
    INSTALL_TIMEOUT_MS,
  );

  const lock = JSON.parse(
    await fs.readFile(`${appDir}/package-lock.json`, "utf8"),
  ) as PackageLock;
  const fromRegistry = registryResolved(lock, new Set(tarballs.keys()));

  if (fromRegistry.length > 0) {
    throw new Error(
      `these packed packages did not resolve from a tarball: ${fromRegistry.join(", ")}`,
    );
  }

  const copies = installedCopies(lock, SINGLE_COPY_PACKAGES);

  for (const [name, keys] of copies) {
    if (keys.length !== 1) {
      throw new Error(
        `the app installs ${keys.length} copies of ${name}: ${keys.length === 0 ? "none" : keys.join(", ")}`,
      );
    }
  }

  console.log(
    `Installed: every packed package from its tarball; one copy each of ${SINGLE_COPY_PACKAGES.join(", ")}`,
  );
};

/**
 * Settles with `promise`, or rejects with `message` once `ms` pass. The timer
 * is cleared either way, so it never holds the process open.
 */
const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  message: () => string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message())), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Opens /hmr, runs `edit` and waits for the update message the dev server
 * sends for it.
 */
const hmrEdit = async (
  port: number,
  edit: () => Promise<void>,
): Promise<string> => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/hmr`);
  const messages: string[] = [];
  const opened = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () =>
      reject(new Error(`ws://127.0.0.1:${port}/hmr did not open`)),
    );
  });
  const updated = new Promise<string>((resolve) => {
    socket.addEventListener("message", (event) => {
      const text = String(event.data);
      messages.push(text);

      if ((JSON.parse(text) as { type?: string }).type === "update") {
        resolve(text);
      }
    });
  });

  try {
    await withTimeout(
      opened,
      HMR_TIMEOUT_MS,
      () => `/hmr did not open within ${HMR_TIMEOUT_MS} ms`,
    );
    await edit();

    return await withTimeout(
      updated,
      HMR_TIMEOUT_MS,
      () =>
        `/hmr sent no update within ${HMR_TIMEOUT_MS} ms of the edit; messages: ${messages.length === 0 ? "none" : messages.join(" ")}`,
    );
  } finally {
    socket.close();
  }
};

const dev = async (
  appDir: string,
  env: Readonly<Record<string, string>>,
): Promise<void> => {
  const port = await freePort();
  const modulesFile = `${appDir}/.laroux-smoke-dev-modules.txt`;
  const server = startScript("dev", port, appDir, {
    ...env,
    [MODULES_ENV]: modulesFile,
  });
  const home = `http://127.0.0.1:${port}/`;

  try {
    await waitForPage(server, home, HOME_TEXT, "laroux dev");
    console.log(`laroux dev serves ${home}`);

    const page = `${appDir}/${HOME_PAGE}`;
    const update = await hmrEdit(port, async () => {
      const source = await fs.readFile(page, "utf8");

      if (!source.includes(HOME_TEXT)) {
        throw new Error(
          `${HOME_PAGE} of the recipe no longer says "${HOME_TEXT}"`,
        );
      }

      await fs.writeFile(page, source.replace(HOME_TEXT, HMR_TEXT));
    });
    console.log(`laroux dev: HMR update after one edit: ${update}`);

    await waitForPage(server, home, HMR_TEXT, "laroux dev after the HMR edit");
    console.log("laroux dev: the page shows the edit");
  } finally {
    await stopScript(server);
  }

  await checkInstances(
    modulesFile,
    { required: SINGLE_COPY_PACKAGES, registry: false },
    "laroux dev",
  );
};

/** The files under `dir`, as paths relative to it. */
const listFiles = async (dir: string): Promise<string[]> =>
  (await fs.readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) =>
      runtime.path.relative(
        dir,
        runtime.path.join(entry.parentPath, entry.name),
      ),
    );

const build = async (
  appDir: string,
  env: Readonly<Record<string, string>>,
): Promise<void> => {
  await fs.writeFile(`${appDir}/${HOME_PAGE}`, REGISTRY_PAGE);

  console.log("Running laroux build ...");
  await run(
    runtime.process.execPath(),
    ["--run", "build"],
    appDir,
    BUILD_TIMEOUT_MS,
    env,
  );

  const serverDir = `${appDir}/dist/server`;
  const modules = (await listFiles(serverDir)).filter((file) =>
    file.endsWith(".js"),
  );
  const sources = await Promise.all(
    modules.map((file) => fs.readFile(`${serverDir}/${file}`, "utf8")),
  );

  if (sources.some((source) => source.includes(ACTION_REGISTRY_TEXT))) {
    throw new Error(
      `the server bundle in ${serverDir} carries a copy of the action registry`,
    );
  }

  if (
    !sources.some((source) =>
      source.includes(`${SERVER_PACKAGE}/action-registry`),
    )
  ) {
    throw new Error(
      `no module in ${serverDir} imports ${SERVER_PACKAGE}/action-registry`,
    );
  }

  console.log(
    `laroux build: ${modules.length} server modules; they import the action registry and carry no copy of it`,
  );
};

const serve = async (
  appDir: string,
  env: Readonly<Record<string, string>>,
): Promise<void> => {
  const port = await freePort();
  const modulesFile = `${appDir}/.laroux-smoke-serve-modules.txt`;
  const server = startScript("serve", port, appDir, {
    ...env,
    [MODULES_ENV]: modulesFile,
  });
  const home = `http://127.0.0.1:${port}/`;

  try {
    await waitForPage(server, home, SERVE_TEXT, "laroux serve");
    await waitForPage(server, home, REGISTERED_TEXT, "laroux serve");
    console.log(`laroux serve serves ${home} with one registered action`);
  } finally {
    await stopScript(server);
  }

  await checkInstances(
    modulesFile,
    { required: SINGLE_COPY_PACKAGES, registry: true },
    "laroux serve",
  );
};

const main = async (): Promise<void> => {
  const options = parseOptions(runtime.process.args);
  const repoRoot = distUtils.repoRootFrom(import.meta.dirname);
  const tarballs = await packedTarballs(repoRoot, options.packsDir);
  const library = await ajanLibrary(repoRoot);
  const appDir = await prepareAppDir(repoRoot, options.appDir);

  try {
    await scaffold(repoRoot, appDir);
    await install(appDir, tarballs);

    const recorder = `${appDir}/.laroux-smoke-recorder.mjs`;
    await fs.writeFile(recorder, RECORDER_SOURCE);

    const env = {
      ESER_AJAN_LIB_PATH: library,
      NODE_OPTIONS: `--import=${url.pathToFileURL(recorder).href}`,
    };

    await dev(appDir, env);
    await build(appDir, { ESER_AJAN_LIB_PATH: library });
    await serve(appDir, env);

    console.log(
      `laroux app preflight: OK (dev with one HMR edit, build and serve on Node ${runtime.version}, no config file)`,
    );
  } finally {
    if (options.appDir === null) {
      await fs.rm(appDir, { recursive: true, force: true });
    } else {
      console.log(`The app stays in ${appDir}`);
    }
  }
};

if (import.meta.main) {
  // Script entry point: the preflight and CI run the file directly.
  // oxlint-disable-next-line node/no-top-level-await
  await main();
}
