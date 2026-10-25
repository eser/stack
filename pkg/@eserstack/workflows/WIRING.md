# @eserstack/workflows — FFI Wiring Notes

## The run command uses the TypeScript engine only

`workflows run` runs every workflow on the TypeScript engine in `engine.ts`. It
does not call the bridge's `EserAjanWorkflowRun`, which runs workflows on the Go
engine in `pkg/ajan/workflowfx`.

`run.ts` used to try the Go engine first when no tools were injected. The
command module (`module.ts`) always injects a tool list, an empty one for the
standalone CLI, so that branch never ran, and it was removed.

The Go engine has since closed the gaps that kept it apart (TASK-244); each row
has a Go test in `pkg/ajan/workflowfx/wiring_gaps_test.go`:

| Area                       | TypeScript engine                                       | `workflowfx` and `EserAjanWorkflowRun`                                                                                      |
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
manifest. The bridge streams nothing yet; the stream exports of M2-T7 bring
per-step progress across it.

## Where the native library is still used

The shell tool runs its command through `@eserstack/shell/exec`. When the native
library is loaded, that is the bridge's `EserAjanShellExec`, which kills the
command's whole process group at the step's timeout. Otherwise the runtime spawn
runs the command and, at the same timeout, signals the `sh` process only, so a
process it started in the background keeps running.

The codebase validators that the eser CLI injects call the bridge themselves.
