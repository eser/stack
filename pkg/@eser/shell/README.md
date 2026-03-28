# 🐚 [@eser/shell](./)

`@eser/shell` is a comprehensive shell utilities library for building CLI
applications. It provides four submodules for different aspects of CLI
development:

- **`@eser/shell/completions`** - Shell completion script generation for bash,
  zsh, and fish
- **`@eser/shell/args`** - Hierarchical CLI framework for building command trees
- **`@eser/shell/exec`** - Lightweight shell execution with template-literal API
- **`@eser/shell/tui`** - Terminal UI: interactive prompts, spinners, progress
  bars, and styled output (built on `@eser/streams/span`)

## 💫 Key features

- **Multi-Shell Support:** Generate completion scripts for bash, zsh, and fish
  shells.

- **Hierarchical CLI Framework:** Build hierarchical command structures with
  flags, subcommands, and automatic help generation.

- **Template Literal Execution:** Execute shell commands using intuitive
  template strings.

- **Runtime Agnostic:** Works with Deno, Node.js, and Bun via
  `@eser/standards/cross-runtime`.

- **Type-Safe:** Written in TypeScript with full type support.

## 📦 Submodules

### @eser/shell/completions

Low-level shell completion script generators. These generate native shell
scripts that can be sourced or evaluated.

```typescript
import { generate } from "@eser/shell/completions";

const tree = {
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
const bashScript = generate("bash", "myapp", tree);
console.log(bashScript);

// Generate zsh completion script
const zshScript = generate("zsh", "myapp", tree);

// Generate fish completion script
const fishScript = generate("fish", "myapp", tree);
```

### @eser/shell/args

A Hierarchical CLI framework for building command trees with flags, subcommands,
and automatic help/completion generation.

```typescript
import { Command } from "@eser/shell/args";

const app = new Command("myapp")
  .description("My CLI application")
  .version("1.0.0")
  .persistentFlag({
    name: "verbose",
    short: "v",
    type: "boolean",
    description: "Enable verbose output",
  });

const initCommand = new Command("init")
  .description("Initialize a new project")
  .flag({
    name: "template",
    short: "t",
    type: "string",
    description: "Project template to use",
    default: "default",
  })
  .run(async (ctx) => {
    const template = ctx.flags["template"] as string;
    console.log(`Initializing project with template: ${template}`);
  });

const buildCommand = new Command("build")
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
  .run(async (ctx) => {
    const output = ctx.flags["output"] as string;
    const minify = ctx.flags["minify"] as boolean;
    console.log(`Building to ${output}, minify: ${minify}`);
  });

app.commands(initCommand, buildCommand);

// Parse command line arguments and execute
await app.parse();
```

#### Command Class API

| Method                     | Description                               |
| -------------------------- | ----------------------------------------- |
| `description(text)`        | Set command description                   |
| `version(version)`         | Set application version                   |
| `usage(text)`              | Set custom usage text                     |
| `example(text)`            | Add usage example                         |
| `aliases(...names)`        | Add command aliases                       |
| `flag(def)`                | Add a flag to this command                |
| `persistentFlag(def)`      | Add a flag that propagates to subcommands |
| `args(validation, count?)` | Configure argument validation             |
| `command(child)`           | Add a subcommand                          |
| `commands(...children)`    | Add multiple subcommands                  |
| `run(handler)`             | Set the command handler                   |
| `parse(argv?)`             | Parse arguments and execute               |
| `help()`                   | Generate help text                        |
| `completions(shell)`       | Generate completion script                |

### @eser/shell/exec

A lightweight template-literal API for shell execution using template literals.

```typescript
import { $ } from "@eser/shell/exec";

// Basic command execution
const result = await $`echo hello world`.text();
console.log(result); // "hello world"

// Get output as lines
const files = await $`ls -la`.lines();
console.log(files);

// Parse JSON output
const data = await $`curl -s https://api.example.com/data`.json<
  { id: number }
>();
console.log(data.id);

// Get exit code
const code = await $`test -f package.json`.code();
console.log(code === 0 ? "exists" : "not found");

// Variable interpolation
const dir = "/tmp";
const contents = await $`ls ${dir}`.lines();

// Fluent configuration
const output = await $`npm run build`
  .cwd("/path/to/project")
  .env("NODE_ENV", "production")
  .timeout(60000)
  .text();

// Suppress errors
const result2 = await $`command-that-might-fail`
  .noThrow()
  .spawn();
console.log(result2.success ? "ok" : "failed");

// Quiet mode (suppress stdout/stderr)
await $`npm install`.quiet().spawn();
```

#### CommandBuilder Methods

| Method            | Description                                  |
| ----------------- | -------------------------------------------- |
| `cwd(path)`       | Set working directory                        |
| `env(key, value)` | Set environment variable                     |
| `stdin(option)`   | Configure stdin ("inherit", "piped", "null") |
| `stdout(option)`  | Configure stdout                             |
| `stderr(option)`  | Configure stderr                             |
| `timeout(ms)`     | Set execution timeout                        |
| `noThrow()`       | Don't throw on non-zero exit                 |
| `quiet()`         | Suppress stdout/stderr                       |
| `spawn()`         | Execute and return result                    |
| `text()`          | Execute and return stdout as string          |
| `json<T>()`       | Execute and parse stdout as JSON             |
| `lines()`         | Execute and return stdout as lines           |
| `bytes()`         | Execute and return stdout as Uint8Array      |
| `code()`          | Execute and return exit code                 |

### @eser/shell/tui

Terminal UI — interactive prompts, spinners, progress bars, and styled output.
Built on `@eser/streams/span` for multi-target rendering (ANSI, Markdown,
plain).

```typescript
import * as tui from "@eser/shell/tui";

// Create a TUI context (production: real terminal)
const ctx = tui.createTuiContext();

// Interactive prompts
const name = await tui.text(ctx, { message: "Project name?" });
const framework = await tui.select(ctx, {
  message: "Pick a framework",
  options: [
    { value: "next", label: "Next.js" },
    { value: "svelte", label: "SvelteKit" },
  ],
});
const features = await tui.multiselect(ctx, {
  message: "Select features",
  options: [
    { value: "ts", label: "TypeScript" },
    { value: "lint", label: "ESLint" },
  ],
});
const deploy = await tui.confirm(ctx, { message: "Deploy now?" });

// Spinner for async operations
const s = tui.createSpinner(ctx, "Installing...");
s.start();
// await install();
s.succeed("Installed!");

// Structured logging
tui.log.info(ctx, "Processing files...");
tui.log.success(ctx, "All done!");
```

#### Interactive vs Non-Interactive Modes

`createTuiContext` accepts a `target` parameter to switch between interactive
(human terminal) and non-interactive (agent/CI) modes:

```typescript
import * as tui from "@eser/shell/tui";

// Interactive mode (default) — ANSI output to stdout, reads from stdin
const humanCtx = tui.createTuiContext({ target: "interactive" });

// Non-interactive mode — plain text output to stderr, stdout stays clean for JSON
const agentCtx = tui.createTuiContext({ target: "non-interactive" });
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

## 🛠 Usage Examples

### Building a Complete CLI

```typescript
import { Command } from "@eser/shell/args";
import { $ } from "@eser/shell/exec";

const cli = new Command("devtool")
  .description("Development toolkit")
  .version("1.0.0");

const testCommand = new Command("test")
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
    await $`npm test ${args.join(" ")}`.spawn();
  });

const lintCommand = new Command("lint")
  .description("Run linter")
  .flag({
    name: "fix",
    type: "boolean",
    description: "Auto-fix issues",
  })
  .run(async (ctx) => {
    const fix = ctx.flags["fix"] as boolean;
    const cmd = fix ? "npm run lint:fix" : "npm run lint";
    await $`${cmd}`.spawn();
  });

const completionsCommand = new Command("completions")
  .description("Generate shell completions")
  .flag({
    name: "shell",
    type: "string",
    description: "Shell type (bash, zsh, fish)",
  })
  .run((ctx) => {
    const shell = (ctx.flags["shell"] as string) ?? "bash";
    console.log(ctx.root.completions(shell as "bash" | "zsh" | "fish"));
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

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
