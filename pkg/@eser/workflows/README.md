# ⚡ [@eser/workflows](./)

`@eser/workflows` is an event-driven workflow engine for running tool pipelines.
Define workflows declaratively in YAML or build them programmatically with the
builder API.

## 🚀 Quick Start

```bash
# Run all workflows matching an event
npx eser workflows run -e precommit

# Run a specific workflow by id
npx eser workflows run -w default --fix

# List available workflows and tools
npx eser workflows list
```

## 📋 .manifest.yml

Create a `.manifest.yml` at your project root:

```yaml
stack:
  - javascript

workflows:
  - id: default
    on: [precommit, prepush]
    steps:
      # Built-in validation tools (from @eser/codebase)
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

Build workflows programmatically without YAML:

```ts
import * as workflows from "@eser/workflows";
import * as task from "@eser/functions/task";
import * as results from "@eser/primitives/results";

// Create a registry and register tools
const registry = workflows.createRegistry();
registry.register({
  name: "my-check",
  description: "Custom checker",
  run: async (options) => ({
    name: "my-check",
    passed: true,
    issues: [],
    mutations: [],
    stats: { filesChecked: 1 },
  }),
});

// Build a workflow
const workflow = workflows.createWorkflow("ci")
  .on("precommit")
  .step("my-check", { strict: true })
  .build();

// Run it — runWorkflow() returns a Task, use task.runTask() to execute
const result = await task.runTask(
  workflows.runWorkflow(workflow, registry, { fix: true }),
);

// result is Result<WorkflowResult, WorkflowError>
if (results.isOk(result)) {
  console.log(result.value.passed ? "All checks passed" : "Some checks failed");
} else {
  console.error(result.error.message);
}
```

Or define from a plain object:

```js
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
    fixCommand: deno fmt # runs when --fix is passed
    workingDirectory: ./src/ # optional working directory
    timeout: 120 # timeout in seconds
    continueOnError: true # don't fail the whole workflow
```

## 📋 CLI Flags

```
-e, --event <name>     Run workflows matching an event
-w, --workflow <id>    Run a specific workflow by id
--fix                  Auto-fix issues (uses fixCommand for shell steps)
--json                 Output results as JSON (suppresses progress)
--verbose              Show stats and issues for all steps
--changed              Only check files changed in git
--only <step>          Run only a specific step
--config <path>        Config directory (default: .)
```

## ⚙️ Step Options

Engine directives that can be added to any step:

```yaml
- validate-json:
    exclude: [...] # tool-specific option
    continueOnError: true # don't stop workflow on failure
    timeout: 120 # per-step timeout in seconds
```

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

```
@eser/workflows
├── mod.ts          Core library (types, registry, engine, builder)
├── loader.ts       .manifest.yml file loader
├── run.ts          CLI: workflows run
├── list.ts         CLI: workflows list
└── shell-tool.ts   Built-in shell command tool
```

The core library (`mod.ts`) has zero I/O dependencies — it's pure functions for
composing and running workflows. File loading and CLI are separate entry points.

`runWorkflow()` and `runByEvent()` return lazy `Task` values (from
`@eser/functions/task`). Use `task.runTask()` to execute and get a
`Result<WorkflowResult, WorkflowError>` — check it with `results.isOk()`.

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
