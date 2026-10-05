# @eserstack/workflows — FFI Wiring Notes

## The run command uses the TypeScript engine only

`workflows run` runs every workflow on the TypeScript engine in `engine.ts`. It
does not call the bridge's `EserAjanWorkflowRun`, which runs workflows on the Go
engine in `pkg/ajan/workflowfx`.

`run.ts` used to try the Go engine first when no tools were injected. The
command module (`module.ts`) always injects a tool list, an empty one for the
standalone CLI, so that branch never ran. It was removed instead of made
reachable, because the Go path does not give the same results:

| Area                       | TypeScript engine                                       | `EserAjanWorkflowRun`                                    |
| -------------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| Tools                      | The shell tool and injected tools (codebase validators) | The shell tool only                                      |
| Step format                | Manifest steps: a tool name, or `{ tool: options }`     | `{ name, options }` objects, so a manifest step fails    |
| `fixCommand`               | Runs with `--fix`                                       | Ignored                                                  |
| `--dry-run`                | Shell steps run `command` instead of `fixCommand`       | Not sent                                                 |
| Positional arguments       | Passed to tools as `_args`                              | Not sent                                                 |
| `name`, `workingDirectory` | Applied                                                 | Ignored                                                  |
| Step `timeout` option      | Seconds, applied to the step and to the shell command   | Read only from a `timeoutMs` field of the step object    |
| Progress                   | Each step is printed as it ends                         | Results arrive after the whole run                       |
| Result fields              | `workflowId`, numeric `stats`                           | `id`, and `stats.output` holds the command's output text |

## Where the native library is still used

The shell tool runs its command through `@eserstack/shell/exec`. When the native
library is loaded, that is the bridge's `EserAjanShellExec`, which kills the
command's whole process group at the step's timeout. Otherwise the runtime spawn
runs the command and, at the same timeout, signals the `sh` process only, so a
process it started in the background keeps running.

The codebase validators that the eser CLI injects call the bridge themselves.
