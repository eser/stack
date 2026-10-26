# 🐚 [@eserstack/shell](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/shell` is published
> on npm under the same name (`pnpm add @eserstack/shell`); the JSR versions
> stay available but get no updates.

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/shell`

`@eserstack/shell` is a shell utilities library for building CLI applications.
Import the package root once and reach every part through its namespace:

- **`shell.completions`** - Shell completion script generation for bash, zsh,
  and fish
- **`shell.args`** - Hierarchical CLI framework for building command trees
- **`shell.exec`** - Lightweight shell execution with template-literal API
- **`shell.env`** - Shell and environment detection, plus `resolveExecutable` /
  `hasExecutable` for finding a binary on PATH
- **`shell.tui`** - Terminal UI: interactive prompts, spinners, progress bars,
  and styled output (built on `@eserstack/streams/span`)
- **`shell.Module`** - Module definitions for composing command trees
- **`shell.vterm`** - Virtual terminal emulation
- **`shell.goExec`** - Execution through the Go native library

Each part is also published as a sub-path (`@eserstack/shell/exec`,
`@eserstack/shell/env`, `@eserstack/shell/module`, `@eserstack/shell/tui/types`
and the others in `package.json`) for code that wants a smaller module graph.
The root costs little extra: `tui` already loads `vterm` for its terminal
widget, and `exec` already loads the Go bridge client that `goExec` uses.

## 🚀 Quick Start

A command with one flag that runs a shell command and prints its output:

```typescript
import * as primitives from "@eserstack/primitives";
import * as shell from "@eserstack/shell";

const app = new shell.args.Command("greet")
  .description("Greet someone from the shell")
  .flag({
    name: "name",
    type: "string",
    description: "Who to greet",
    default: "world",
  })
  .run(async (ctx) => {
    const name = ctx.flags["name"] as string;
    const greeting = await shell.exec.exec`echo hello ${name}`.text();
    console.log(greeting);
    return primitives.results.ok(undefined);
  });

await app.parse();
```

Every command handler returns a `CliResult` from `@eserstack/primitives`:
`results.ok(...)` on success, `results.fail({ message, exitCode })` on failure.

## 💫 Key features

- **Multi-Shell Support:** Generate completion scripts for bash, zsh, and fish
  shells.

- **Hierarchical CLI Framework:** Build hierarchical command structures with
  flags, subcommands, and automatic help generation.

- **Template Literal Execution:** Execute shell commands using intuitive
  template strings.

- **Node.js:** Runs on Node.js through `@eserstack/standards/cross-runtime`.

- **Type-Safe:** Written in TypeScript with full type support.

## 📦 Submodules

### @eserstack/shell/completions

Low-level shell completion script generators. These generate native shell
scripts that can be sourced or evaluated.

```typescript
import * as shell from "@eserstack/shell";

const tree: shell.completions.CompletionNode = {
  name: "myapp",
  description: "My CLI application",
  children: [
    { name: "init", description: "Initialize project" },
    { name: "build", description: "Build the project" },
    {
      name: "deploy",
      description: "Deploy application",
      children: [
        { name: "staging", description: "Deploy to staging" },
        { name: "production", description: "Deploy to production" },
      ],
    },
  ],
};

// Generate bash completion script
const bashScript = shell.completions.generate("bash", "myapp", tree);
console.log(bashScript);

// Generate zsh completion script
const zshScript = shell.completions.generate("zsh", "myapp", tree);

// Generate fish completion script
const fishScript = shell.completions.generate("fish", "myapp", tree);
```

### @eserstack/shell/args

A Hierarchical CLI framework for building command trees with flags, subcommands,
and automatic help/completion generation.

```typescript
import * as primitives from "@eserstack/primitives";
import * as shell from "@eserstack/shell";

const app = new shell.args.Command("myapp")
  .description("My CLI application")
  .version("1.0.0")
  .persistentFlag({
    name: "verbose",
    short: "v",
    type: "boolean",
    description: "Enable verbose output",
  });

const initCommand = new shell.args.Command("init")
  .description("Initialize a new project")
  .flag({
    name: "template",
    short: "t",
    type: "string",
    description: "Project template to use",
    default: "default",
  })
  .run((ctx) => {
    const template = ctx.flags["template"] as string;
    console.log(`Initializing project with template: ${template}`);
    return primitives.results.ok(undefined);
  });

const buildCommand = new shell.args.Command("build")
  .description("Build the project")
  .flag({
    name: "output",
    short: "o",
    type: "string",
    description: "Output directory",
    default: "dist",
  })
  .flag({
    name: "minify",
    type: "boolean",
    description: "Minify output",
  })
  .run((ctx) => {
    const output = ctx.flags["output"] as string;
    const minify = ctx.flags["minify"] as boolean;
    console.log(`Building to ${output}, minify: ${minify}`);
    return primitives.results.ok(undefined);
  });

app.commands(initCommand, buildCommand);

// Parse command line arguments and execute
await app.parse();
```

#### Command Class API

| Method                                | Description                                     |
| ------------------------------------- | ----------------------------------------------- |
| `description(text)`                   | Set command description                         |
| `version(version)`                    | Set application version                         |
| `usage(text)`                         | Set custom usage text                           |
| `example(text)`                       | Add usage example                               |
| `aliases(...names)`                   | Add command aliases                             |
| `flag(def)`                           | Add a flag to this command                      |
| `persistentFlag(def)`                 | Add a flag that propagates to subcommands       |
| `args(validation, count?)`            | Configure argument validation                   |
| `command(child)`                      | Add a subcommand                                |
| `commands(...children)`               | Add multiple subcommands                        |
| `run(handler)`                        | Set the command handler                         |
| `lazyCommand(name, opts)`             | Add a subcommand loaded on first use            |
| `group(name, opts)`                   | Add a group of lazily loaded modules            |
| `groupAlias(alias, name, opts)`       | Route another name to a group, hidden from help |
| `shortcut(name, target, description)` | Route a top-level name to a nested command      |
| `modules(opts)`                       | Dispatch modules without a group prefix         |
| `fallback(handler)`                   | Handle commands no other route matches          |
| `parse(argv?)`                        | Parse arguments and execute                     |
| `help()`                              | Generate help text                              |
| `completions(shell)`                  | Generate completion script                      |

A module's `main(args)` reads its flags without a `Command` through
`shell.args.parseFlags(args, flagDefs)`, or `shell.args.parseArgs(args, { options })`
for a plain `{ values, positionals }` result. Both run `parseArgs` from
`node:util` in its lenient mode: an unknown flag is kept instead of failing, a
string flag given without a value reads as `""`, and `--flag=false` turns a
boolean flag off. `@eserstack/shell/args/flags` publishes them without the
rest of the framework.

```typescript
import * as shell from "@eserstack/shell";

const { values, positionals } = shell.args.parseArgs(["-n", "patch"], {
  options: { "dry-run": { type: "boolean", short: "n" } },
});
// values["dry-run"] is true, positionals is ["patch"]
```

### @eserstack/shell/module

A command module that loads each of its commands only when that command runs,
available as `shell.Module`. Run a module as its own CLI with
`toCommand(name, version).parse()`, or mount it under another module with
`addSubmodule()`, where its commands become a group. The `eser` CLI mounts the
modules of its packages this way.

```typescript
import * as primitives from "@eserstack/primitives";
import * as shell from "@eserstack/shell";

const greetings = new shell.Module({
  description: "Greeting commands",
  modules: {
    hello: {
      description: "Print a greeting",
      load: () =>
        Promise.resolve({
          main: (args?: readonly string[]) => {
            console.log(`Hello, ${args?.[0] ?? "world"}`);
            return Promise.resolve(primitives.results.ok(undefined));
          },
        }),
    },
  },
});

const toolkit = new shell.Module({ description: "My toolkit" });
toolkit.addSubmodule({ name: "greet", aliases: ["g"] }, greetings);

// `toolkit greet hello Ada` and `toolkit g hello Ada` print "Hello, Ada"
await toolkit.toCommand("toolkit", "1.0.0").parse();
```

Each entry's `load` returns an object with a `main(args)` function. In a package
it is usually `() => import("./hello.ts")`, so a command's code loads only when
someone runs it. `greetings.toCommand("greet").parse()` runs the same commands
without the group prefix: `greet hello Ada`.

### @eserstack/shell/exec

A lightweight template-literal API for shell execution using template literals.

```typescript
import * as shell from "@eserstack/shell";

// Basic command execution
const result = await shell.exec.exec`echo hello world`.text();
console.log(result); // "hello world"

// Get output as lines
const files = await shell.exec.exec`ls -la`.lines();
console.log(files);

// Parse JSON output
const data = await shell.exec.exec`curl -s https://api.example.com/data`.json<{
  id: number;
}>();
console.log(data.id);

// Get exit code
const code = await shell.exec.exec`test -f package.json`.code();
console.log(code === 0 ? "exists" : "not found");

// Variable interpolation
const dir = "/tmp";
const contents = await shell.exec.exec`ls ${dir}`.lines();

// Fluent configuration
const output = await shell.exec.exec`npm run build`
  .cwd("/path/to/project")
  .env("NODE_ENV", "production")
  .timeout(60_000)
  .text();

// Suppress errors
const result2 = await shell.exec.exec`command-that-might-fail`
  .noThrow()
  .spawn();
console.log(result2.success ? "ok" : "failed");

// Quiet mode (suppress stdout/stderr)
await shell.exec.exec`npm install`.quiet().spawn();
```

#### CommandBuilder Methods

| Method            | Description                                  |
| ----------------- | -------------------------------------------- |
| `cwd(path)`       | Set working directory                        |
| `env(key, value)` | Set environment variable                     |
| `stdin(option)`   | Configure stdin ("inherit", "piped", "null") |
| `stdinText(data)` | Write `data` to stdin and close it           |
| `stdout(option)`  | Configure stdout                             |
| `stderr(option)`  | Configure stderr                             |
| `timeout(ms)`     | Stop the command after `ms` milliseconds     |
| `noThrow()`       | Don't throw on non-zero exit                 |
| `quiet()`         | Suppress stdout/stderr                       |
| `printCommand()`  | Print the command line as `$ cmd args`       |
| `spawn()`         | Execute and return result                    |
| `text()`          | Execute and return stdout as string          |
| `json<T>()`       | Execute and parse stdout as JSON             |
| `lines()`         | Execute and return stdout as lines           |
| `bytes()`         | Execute and return stdout as Uint8Array      |
| `code()`          | Execute and return exit code                 |
| `child()`         | Spawn with streaming stdin, stdout, stderr   |

#### Timeouts and errors

A command whose output is captured (`"piped"` or `"null"` stdio, the default)
stops after 10 minutes when you set no `timeout()`. A command with any
`"inherit"` stdio has no default: it is attached to your terminal, where you can
interrupt it. `timeout()` takes milliseconds above 0 and at most 2147483647
(about 24.8 days). There is no value for "no limit": `timeout(0)` throws a
`RangeError`, so pass a larger value for a long command.

Two error types tell the failures apart:

- `shell.exec.CommandError`: the command ran and exited non-zero. It carries
  `code` and `stderr`. `noThrow()` turns it off.
- `shell.exec.CommandRunError`: the command did not run to an exit code. The
  program or the working directory does not exist, or the command ran past its
  timeout. `noThrow()` does not turn it off, since there is no exit code to
  return.

```typescript
import * as shell from "@eserstack/shell";

try {
  await shell.exec.exec`git fetch origin`.timeout(30_000).spawn();
} catch (error) {
  if (error instanceof shell.exec.CommandRunError) {
    console.error(`git did not finish: ${error.message}`);
  } else if (error instanceof shell.exec.CommandError) {
    console.error(`git exited with ${error.code}: ${error.stderr}`);
  } else {
    throw error;
  }
}
```

A captured command runs through the Go native library when it is installed, and
through the runtime's own spawn otherwise. A command with piped stdin
(`stdinText()`) or any `"inherit"` stdio always uses the runtime spawn. Either
way the command runs once: an error from the native library is thrown, never
retried through the runtime.

### @eserstack/shell/env

Shell and environment detection, available as `shell.env`.

#### Finding an executable

```typescript
import * as shell from "@eserstack/shell";

const path = await shell.env.resolveExecutable("claude"); // string | null
const ok = await shell.env.hasExecutable("claude"); // boolean
```

PATH is walked in-process rather than shelling out to `which`. A `which` call
costs a subprocess per lookup and does not exist on Windows. It would also run
through the Go native library, which keeps the environment it loaded with, so it
cannot see a PATH exported afterwards. The execute bit is checked via
`FileInfo.mode`, treating `null` (Windows, where there is no such bit) as
"cannot tell" rather than "not executable".

This is the implementation `eser`'s `eser-<name>` plugin lookup uses.

### @eserstack/shell/tui

Terminal UI — interactive prompts, spinners, progress bars, and styled output.
Built on `@eserstack/streams/span` for multi-target rendering (ANSI, Markdown,
plain).

```typescript
import * as shell from "@eserstack/shell";

// Create a TUI context (production: real terminal)
const ctx = shell.tui.createTuiContext();

// Interactive prompts
const name = await shell.tui.text(ctx, { message: "Project name?" });
const framework = await shell.tui.select(ctx, {
  message: "Pick a framework",
  options: [
    { value: "next", label: "Next.js" },
    { value: "svelte", label: "SvelteKit" },
  ],
});
const features = await shell.tui.multiselect(ctx, {
  message: "Select features",
  options: [
    { value: "ts", label: "TypeScript" },
    { value: "lint", label: "ESLint" },
  ],
});
const deploy = await shell.tui.confirm(ctx, { message: "Deploy now?" });

// Spinner for async operations
const s = shell.tui.createSpinner(ctx, "Installing...");
s.start();
// await install();
s.succeed("Installed!");

// Structured logging
shell.tui.log.info(ctx, "Processing files...");
shell.tui.log.success(ctx, "All done!");
```

#### Interactive vs Non-Interactive Modes

`createTuiContext` accepts an `interaction` option to switch between interactive
(human terminal) and non-interactive (agent/CI) modes. The older `target` option
takes the same values and is deprecated:

```typescript
import * as shell from "@eserstack/shell";

// Interactive mode (the default): ANSI output to stdout, reads from stdin
const humanCtx = shell.tui.createTuiContext({ interaction: "interactive" });

// Non-interactive mode: plain text to stderr, so stdout stays clean for JSON
const agentCtx = shell.tui.createTuiContext({
  interaction: "non-interactive",
});
```

| Behavior        | `interactive`            | `non-interactive`        |
| --------------- | ------------------------ | ------------------------ |
| Output renderer | ANSI (colors, bold)      | Plain text (no escapes)  |
| Output sink     | stdout                   | stderr                   |
| Prompts         | Real terminal prompts    | Return defaults / cancel |
| Spinners        | Animated terminal output | Silent or stderr logging |
| `log.*` calls   | Styled stdout            | Plain stderr             |

This lets the same CLI code work for both human users and AI agents without
branching logic throughout commands. The context also exposes a `stderr` output
for cases where you need to write diagnostics regardless of mode.

### @eserstack/shell/vterm

A virtual terminal backed by `@xterm/headless`, available as `shell.vterm`. Feed
it raw PTY output and render the screen as ANSI for a TUI panel.

```typescript
import * as shell from "@eserstack/shell";

const screen = new shell.vterm.VTerminal(24, 80);
await screen.writeAsync("\x1b[1mbuild\x1b[0m finished\r\n");

const frame = shell.vterm.renderScreen(screen, {
  offsetRow: 1,
  offsetCol: 1,
  width: 80,
  height: 24,
});
```

### @eserstack/shell/go-exec

Runs a command through the Go native library and returns its captured output,
available as `shell.goExec`. It throws when the native library is not available;
`shell.exec` falls back to the runtime spawn instead. A non-zero exit comes back
in `code`. The `timeout` option works as `timeout()` does above: 10 minutes when
unset, and a `RangeError` for 0. A command that cannot start or runs past its
timeout throws `shell.exec.CommandRunError`.

```typescript
import * as shell from "@eserstack/shell";

const result = await shell.goExec.goExec("git", {
  args: ["log", "--oneline", "-5"],
  env: { GIT_PAGER: "cat" },
  timeout: 30_000,
});
console.log(result.code, result.stdout);
```

## TUI Widgets

Layout, scroll, tabs, and text editing primitives for terminal UIs.

### Flex Layout

Build flexible panel layouts with a subset of CSS Flexbox (direction,
grow/shrink, gap, padding):

```typescript
import * as shell from "@eserstack/shell";

const root: shell.tui.layoutTypes.FlexNode = {
  direction: "row",
  children: [
    { id: "sidebar", size: { type: "fixed", value: 30 } },
    { id: "main", size: { type: "flex", grow: 1 } },
  ],
};

const panels = shell.tui.flexLayout.computeLayout(root, 120, 40);
const main = shell.tui.flexLayout.findPanel(panels, "main");
```

### ScrollContainer

Generic scrollable viewport for any content:

```typescript
import * as shell from "@eserstack/shell";

const panel = { x: 0, y: 0, width: 40, height: 10 };

let state = shell.tui.scrollContainer.createScrollState(100, 10); // 100 items, 10 visible
state = shell.tui.scrollContainer.scrollReducer(state, "pageDown");
const bar = shell.tui.scrollContainer.renderScrollbar(panel, state);
```

### TabBar

Reusable tab strip with badge support:

```typescript
import * as shell from "@eserstack/shell";

const output = shell.tui.tabBar.renderTabBar({
  tabs: [
    { id: "1", label: "Main" },
    { id: "2", label: "Logs", badge: "3", badgeColor: "red" },
  ],
  activeIndex: 0,
  maxWidth: 80,
});
```

### Textarea

Multi-line text editor with undo/redo and selection:

```typescript
import * as shell from "@eserstack/shell";

let state = shell.tui.textarea.createTextareaState("Hello\nWorld");
let undo = shell.tui.textarea.createUndoStack();
({ state, undoStack: undo } = shell.tui.textarea.textareaReducer(
  state,
  { type: "insert", text: "!" },
  undo,
));
```

### Dirty Tracking

Skip re-rendering unchanged panels:

```typescript
import * as shell from "@eserstack/shell";

const renderSidebar = (): void => {
  /* draw the sidebar panel */
};

let tracker = shell.tui.dirtyTracker.createDirtyTracker(["sidebar", "main"]);
if (shell.tui.dirtyTracker.isDirty(tracker, "sidebar")) {
  renderSidebar();
  tracker = shell.tui.dirtyTracker.markClean(tracker, "sidebar");
}
```

## 🛠 Usage Examples

### Building a Complete CLI

```typescript
import * as primitives from "@eserstack/primitives";
import * as shell from "@eserstack/shell";

const cli = new shell.args.Command("devtool")
  .description("Development toolkit")
  .version("1.0.0");

const testCommand = new shell.args.Command("test")
  .description("Run tests")
  .flag({
    name: "watch",
    short: "w",
    type: "boolean",
    description: "Watch mode",
  })
  .run(async (ctx) => {
    const watch = ctx.flags["watch"] as boolean;
    const args = watch ? ["--watch"] : [];
    await shell.exec.exec`npm test ${args}`.spawn();
    return primitives.results.ok(undefined);
  });

const lintCommand = new shell.args.Command("lint")
  .description("Run linter")
  .flag({
    name: "fix",
    type: "boolean",
    description: "Auto-fix issues",
  })
  .run(async (ctx) => {
    const fix = ctx.flags["fix"] as boolean;
    const script = fix ? "lint:fix" : "lint";
    await shell.exec.exec`npm run ${script}`.spawn();
    return primitives.results.ok(undefined);
  });

const completionsCommand = new shell.args.Command("completions")
  .description("Generate shell completions")
  .flag({
    name: "shell",
    type: "string",
    description: "Shell type (bash, zsh, fish)",
  })
  .run((ctx) => {
    const shellName = (ctx.flags["shell"] as string | undefined) ?? "bash";
    console.log(ctx.root.completions(shellName as shell.completions.Shell));
    return primitives.results.ok(undefined);
  });

cli.commands(testCommand, lintCommand, completionsCommand);

await cli.parse();
```

### Generating Completion Scripts

To enable tab completion for your CLI:

**Bash** - Add to `~/.bashrc`:

```bash
eval "$(myapp completions --shell bash)"
```

**Zsh** - Add to `~/.zshrc`:

```bash
eval "$(myapp completions --shell zsh)"
```

**Fish** - Run once:

```bash
myapp completions --shell fish > ~/.config/fish/completions/myapp.fish
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- A command that does not run to an exit code throws
  `shell.exec.CommandRunError`, even with `noThrow()`: a missing program or
  working directory, a request the native library rejects, or a timeout. On the
  runtime spawn path it used to be the runtime's own error (Node's `ENOENT`),
  now in `error.cause`; with the native library, `spawn()` used to retry through
  the runtime. A timeout on the runtime path used to be a `CommandError` with the
  killed process's exit code. Catch the new class:

  ```typescript
  import * as shell from "@eserstack/shell";

  try {
    await shell.exec.exec`git fetch origin`.timeout(30_000).spawn();
  } catch (error) {
    // Before: an ENOENT error, or a CommandError on timeout
    if (error instanceof shell.exec.CommandRunError) {
      console.error(`git did not finish: ${error.message}`, error.cause);
    }
  }
  ```

- The native library looks programs up on the `PATH` the process started with.
  Pass an absolute path for a program found only through a `PATH` changed later.
- `timeout(ms)` and the constructor's `options.timeout` throw `RangeError` for
  0, negative values, `NaN`, `Infinity` and values above 2147483647. Before:
  `.timeout(0)` meant no limit. After: pass a positive number of milliseconds.
- A command with captured output and no `timeout()` stops after 10 minutes on
  the runtime path too. Pass a larger `timeout()` for longer commands.
- `goExec` errors are `CommandRunError`, still an `Error` subclass.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
