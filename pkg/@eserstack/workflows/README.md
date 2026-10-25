# ⚡ [@eserstack/workflows](./)

> **Note:** JSR is frozen at 4.5.x. From 5.0.0, `@eserstack/workflows` is
> published on npm under the same name (`pnpm add @eserstack/workflows`); the
> JSR versions stay available but get no updates.

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/workflows`

`@eserstack/workflows` is an event-driven workflow engine for running tool
pipelines. Define workflows declaratively in YAML or build them programmatically
with the builder API.

## 🚀 Quick Start

```bash
# Run all workflows matching an event
npx eser workflows run -e precommit

# Run a specific workflow by id
npx eser workflows run -w default --fix

# List available workflows and tools
npx eser workflows list
```

## 📋 .eser/manifest.yml

Create a `.eser/manifest.yml` at your project root:

```yaml
stack:
  - javascript

workflows:
  - id: default
    on: [precommit, prepush]
    steps:
      # Built-in validation tools (from @eserstack/codebase)
      - validate-eof
      - validate-json:
          exclude: ["tsconfig.json"]

      # Shell commands for external tools
      - shell:
          name: format
          command: deno fmt --check
          fixCommand: deno fmt
      - shell:
          name: tests
          command: deno task test:run
          timeout: 300

  - id: commit-validation
    on: [commitmsg]
    steps:
      - validate-commit-msg:
          forceScope: true
```

## 🏗 Builder API

Build workflows programmatically without YAML. The package root
(`@eserstack/workflows`) is the standalone CLI, so the library API is imported
from `@eserstack/workflows/mod`:

```ts
import * as workflows from "@eserstack/workflows/mod";
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";

// Create a registry and register tools
const registry = workflows.createRegistry();
registry.register({
  name: "my-check",
  description: "Custom checker",
  run: () =>
    Promise.resolve({
      name: "my-check",
      passed: true,
      issues: [],
      mutations: [],
      stats: { filesChecked: 1 },
    }),
});

// Build a workflow
const workflow = workflows
  .createWorkflow("ci")
  .on("precommit")
  .step("my-check", { strict: true })
  .build();

// Run it: runWorkflow() returns a Task, functions.task.runTask() executes it
const result = await functions.task.runTask(
  workflows.runWorkflow(workflow, registry, { fix: true }),
);

// result is Result<WorkflowResult, WorkflowError>
if (primitives.results.isFail(result)) {
  throw new Error(`workflow "ci" did not run: ${result.error.message}`);
}

// passed is false when any step failed; steps holds each step's issues
const { passed, steps } = result.value;
```

The engine calls a tool's `run(options, context)` once per step. `options` holds
the step's options plus `root`, `fix`, `dryRun` and `_args` from the run.
`context.timeoutMs` is the step's time limit, and `context.signal` aborts when
the step ends, so pass them to the work the tool starts:

```ts
import * as workflows from "@eserstack/workflows/mod";

const registry = workflows.createRegistry();
registry.register({
  name: "status-check",
  description: "Checks that a URL answers 200",
  run: async (options, context) => {
    const url = options["url"] as string;
    // Aborts when the step runs past its timeout, so the request stops too
    const response = await fetch(url, { signal: context.signal });
    await response.body?.cancel();

    return {
      name: "status-check",
      passed: response.status === 200,
      issues:
        response.status === 200
          ? []
          : [{ message: `${url} answered ${response.status}` }],
      mutations: [],
      stats: { status: response.status },
    };
  },
});
```

Or define from a plain object:

```ts
import * as workflows from "@eserstack/workflows/mod";

const workflow = workflows.defineWorkflow({
  id: "ci",
  on: ["precommit"],
  steps: ["my-check", { "other-check": { strict: true } }],
});
```

## 🐚 Shell Tool

The built-in `shell` tool executes commands via subprocess:

```yaml
- shell:
    name: format
    command: deno fmt --check # runs in check mode
    fixCommand: deno fmt # runs when --fix is passed without --dry-run
    workingDirectory: ./src/ # optional, relative to the project root
    timeout: 120 # timeout in seconds
    continueOnError: true # don't fail the whole workflow
```

A command that runs past the step's `timeout` is stopped, and the step fails
with "Step 'format' (shell) ran past its 120s timeout". With `--dry-run` the
tool never runs `fixCommand`, which would write files; it runs `command` and
reports what that finds.

## 📋 CLI Flags

```text
-e, --event <name>     Run workflows matching an event
-w, --workflow <id>    Run a specific workflow by id
--fix                  Auto-fix issues (uses fixCommand for shell steps)
--dry-run              Preview mutations without writing files (shell steps run command)
--json                 Output results as JSON (suppresses progress)
-v, --verbose          Show stats and issues for all steps
--changed              Only check files changed in git
--only <step>          Run only a specific step
--config <path>        Config directory (default: .)
-h, --help             Show help
```

## ⚙️ Step Options

Engine directives that can be added to any step:

```yaml
- validate-json:
    exclude: [...] # tool-specific option
    continueOnError: true # don't stop workflow on failure
    timeout: 120 # per-step timeout in seconds (default: 60)
```

A step that runs past its `timeout` fails with "Step 'validate-json' ran past
its 120s timeout". The engine then aborts the signal it gave the tool and waits
up to five seconds for the tool to stop before the workflow goes on.

## 🔗 Workflow Composition

Reuse steps across workflows with `includes`:

```yaml
workflows:
  - id: common-fixers
    on: []
    steps:
      - validate-eof
      - validate-trailing-whitespace

  - id: default
    on: [precommit]
    includes: [common-fixers]
    steps:
      - validate-json
```

## 📦 Package Structure

```text
@eserstack/workflows
├── main.ts         Standalone CLI (package root)
├── mod.ts          Core library (types, registry, engine, builder)
├── module.ts       Command module that the eser CLI mounts
├── loader.ts       .eser/manifest.yml file loader
├── run.ts          CLI: workflows run
├── list.ts         CLI: workflows list
└── shell-tool.ts   Built-in shell command tool
```

The core library (`mod.ts`) has zero I/O dependencies — it's pure functions for
composing and running workflows. File loading and CLI are separate entry points.

`runWorkflow()`, `runWorkflowWithConfig()` and `runByEvent()` return lazy `Task`
values (from `@eserstack/functions`). Use `functions.task.runTask()` to execute
one and get a `Result`, then check it with `primitives.results.isOk()` or
`primitives.results.isFail()`.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `WorkflowTool.run` takes a second argument, `context: WorkflowToolContext`
  (`{ timeoutMs, signal }`), and the engine always passes it. Code that calls a
  tool itself passes a context:

  ```typescript
  // Before
  await tool.run(options);
  // After
  await tool.run(options, {
    timeoutMs: 60_000,
    signal: AbortSignal.timeout(60_000),
  });
  ```

- Shell step commands are stopped at the step timeout, 60 s by default; with the
  native library loaded the timeout never fired before. Set `timeout` (seconds)
  on steps that need longer: `timeout: 600`.
- A step `timeout` must be a number of seconds above 0 and at most 2147483. A
  string, zero, a negative number, `.nan` or `.inf` throws
  `Invalid step config for '<step>': timeout must be a number of seconds ...`,
  and `RunOptions.defaultTimeout` outside (0, 2147483647] makes `runWorkflow`
  return a `WorkflowError`. Before: `timeout: "30"`. After: `timeout: 30`.
- A step timeout reads
  `Step 'x' ran past its Ns timeout; raise the step's timeout option (in seconds) to give it more time`
  instead of `Step 'x' timed out after Ns`, and the run waits up to 5 s for the
  tool to stop. Update code that matches the old message.
- With `--fix --dry-run`, a shell step runs `command`, not `fixCommand`, which
  used to write files during a dry run. Drop `--dry-run` to apply shell fixes.
- The shell tool's `workingDirectory` is resolved against the run root (the
  `--config` directory) instead of the process working directory. Write it
  relative to the project root, or as an absolute path.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
