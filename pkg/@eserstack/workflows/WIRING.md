# @eserstack/workflows — FFI Wiring Notes

## The run command uses the TypeScript engine only

`workflows run` runs every workflow on the TypeScript engine in `engine.ts`. It
does not call the bridge's `workflowRun` call, which runs workflows on the Go
engine in `pkg/ajan/workflowfx`.

`run.ts` used to try the Go engine first when no tools were injected. The
command module (`module.ts`) always injects a tool list, an empty one for the
standalone CLI, so that branch never ran, and it was removed.

The Go engine has since closed the gaps that kept it apart (TASK-244); each row
has a Go test in `pkg/ajan/workflowfx/wiring_gaps_test.go`:

| Area                       | TypeScript engine                                       | `workflowfx` and `workflowRun`                                                                                              |
| -------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tools                      | The shell tool and injected tools (codebase validators) | Injected tools; the bridge registers the shell tool and `validatortools.RegisterManifestTools` (the `validate-*` names)     |
| Step format                | Manifest steps: a tool name, or `{ tool: options }`     | `ParseManifest`; the bridge takes the manifest text in `manifest`, or `{ name, options }` objects in `workflows`            |
| `fixCommand`               | Runs with `--fix`                                       | Runs with `fix`                                                                                                             |
| `--dry-run`                | Shell steps run `command` instead of `fixCommand`       | `RunOptions.DryRun` (bridge `dryRun`): no `fixCommand`, no mutations applied                                                |
| Positional arguments       | Passed to tools as `_args`                              | `RunOptions.Args` (bridge `args`), passed as `_args`                                                                        |
| `name`, `workingDirectory` | Applied                                                 | Applied                                                                                                                     |
| Step `timeout` option      | Seconds, applied to the step and to the shell command   | Seconds in a manifest; the step's deadline also ends the command and its children                                           |
| Progress                   | Each step is printed as it ends                         | `OnStepEnd` fires as each step ends, and `ProgressPrinter` prints the run command's lines; the bridge answers after the run |
| Result fields              | `workflowId`, numeric `stats`                           | `id` and `workflowId`, numeric `stats` (`exitCode` for shell steps)                                                         |

A precommit dry run lists the same steps in the same order under both engines:
`engine.test.ts` and `TestDryRunListsTheManifestSteps` check each against the
manifest. `workflowRun` answers after the run. The `workflow-steps` function
(see "Tools that reach Go") answers each step as it ends.

## Where the native library is still used

The shell tool runs its command through `@eserstack/shell/exec`. When the native
library is loaded, that is the bridge's `shellExec` call, which kills the
command's whole process group at the step's timeout. Otherwise the runtime spawn
runs the command and, at the same timeout, signals the `sh` process only, so a
process it started in the background keeps running.

The codebase validators that the eser CLI injects call the bridge themselves.

## Tools that reach Go (ADR 0011)

The TypeScript engine stays the default of `workflows run`. Two tools let a
TypeScript workflow use what runs in Go. This package does not register them:
the application passes the port to the native library in, so the package imports
no native library and a workflow that never uses them loads none. The eser CLI
is that application: `pkg/@eserstack/cli/native-tools.ts` registers
`native-function` and `go-workflow` on `eser workflows run`, and loads the
library on the first call only.

| Tool                    | Factory                                         | Step options                                          | What it does                                                                                                             |
| ----------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `native-function`       | `createNativeFunctionTool(caller)`              | `function` (the name), then the input of the function | Runs a function registered in `pkg/ajan/functionsfx` through `functions.native.fromNative` (the bridge's `functionCall`) |
| `go-workflow`           | `createGoWorkflowTool(runner)`                  | `workflow`, `manifest` or `manifestFile`, `only`      | Runs a workflow on the Go engine (the bridge's `workflowRun`) and brings back its steps as one step                      |
| any function name       | `createNativeFunctionTools(caller, names)`      | the input of the function                             | One tool per native function, under its own name, so a step names it directly                                            |
| any TypeScript function | `createHandlerTool(name, description, handler)` | the input of the function                             | Runs a `@eserstack/functions` `Handler` as a step                                                                        |

The input of a function is the options of the step: the ones the manifest gives
and the ones the engine adds (`root`, `fix`, `dryRun`, `_args`,
`_changedFiles`), the same input the Go engine gives a function step. A function
that answers a `ToolOutput` (`passed`, `issues`, `mutations`, `stats`; the Go
validators do) fills the result of the step. Any other function passes its step
and its output is not kept, because the stats of a TypeScript step hold numbers
only. A `ValidationError` or an `AdaptError` fails the step with its message and
the run goes on; any other failure stops the run unless the step sets
`continueOnError`. The step's signal ends the Go function through its context,
and the step's timeout is the signal's deadline.

`go-workflow` joins the issues and mutations of every Go step into one step
result: an issue's message names the Go step that raised it (`[validate-eof] ...`),
and the stats count `steps`, `failedSteps` and `durationMs`. The Go engine
resolves `if`, `loop` and `includes` itself. An error it answers, such as a
workflow that is not in the manifest, stops the run unless the step sets
`continueOnError`.

The two ports are one line each on a loaded `@eserstack/ajan` library:

```typescript
import * as ffi from "@eserstack/ajan/ffi";
import * as nativeFunctions from "@eserstack/ajan/ffi/functions";
import * as workflows from "@eserstack/workflows/mod";

const lib = await ffi.loadEserAjan({ wasm: false });

const caller: workflows.NativeCaller = (call) =>
  nativeFunctions.callFunction(lib, call);
const runner: workflows.GoWorkflowRunner = async (request, signal) =>
  (await lib.call("workflowRun", request, {
    signal,
  })) as workflows.GoWorkflowAnswer;
```

The bridge serves functions and `workflowRun` on the native library only; the
WASM fallback has neither (ADR 0011, amendments).

### Progress of a Go workflow

`workflow-steps` is a native function that streams (the types are in
`@eserstack/workflows/native-functions`). Its input is `manifest` (the text),
`workflow` (the id) and the options of `workflowRun` (`root`, `only`, `args`,
`changedFiles`, `timeoutMs`, `fix`, `dryRun`); each item is a step as it ends
(`name`, `passed`, `durationMs`, `issues`, `mutations`, `stats`). Read it with
`fromNativeStream` and `streamFunction`:

```typescript
import * as functions from "@eserstack/functions";
import * as nativeFunctions from "@eserstack/ajan/ffi/functions";
import type * as types from "@eserstack/workflows/native-functions";

const steps = functions.native.fromNativeStream<
  types.WorkflowStepsInput,
  types.WorkflowStepsOutput
>((call) => nativeFunctions.streamFunction(lib, call), "workflow-steps");

for await (const step of steps({ manifest, workflow: "check" }, { signal })) {
  // each step arrives as a Result, as the Go engine finishes it
}
```

A failed step is an item and the run goes on, like in the engine. Breaking out
of the loop, or aborting the signal, cancels the run on the Go side and waits for
it. Mutations are reported, not applied.

**Go cannot call TypeScript.** A Go workflow runs Go tools and Go functions. A
workflow that needs a TypeScript tool runs on the TypeScript engine, and it can
run Go workflows and Go functions as steps with the tools above. The direction
is one way on purpose: the bridge has no callback from Go to the host, and
adding one would take separate work in the native library and in the WASM
module.
