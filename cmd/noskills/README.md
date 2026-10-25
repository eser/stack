# noskills (Go)

The Go build of the noskills CLI (M4-T2, decision-25). It runs the agent hooks,
the spec lifecycle (TASK-258), the state commands and sync adapters (TASK-259),
sessions, the user identity and diagrams (TASK-259.1), the spec state commands
and the output formats (TASK-258.1) and `run` (TASK-260) itself, and hands
`watch`, `manager` and `web` to the TypeScript noskills CLI until M5 ports them
(TASK-266).

A hook starts the binary for every guarded tool call. The Go build answers a
PreToolUse call in about 4 ms on an Apple M-series laptop
(`BenchmarkHookStartup`), where the TypeScript hook takes about 125 ms under
Node and more through `npx`, which can also wait on the npm registry.

```sh
make build                       # bin/noskills, with the version from VERSION
bin/noskills --help
go test -run '^$' -bench HookStartup ./cmd/noskills/
```

## Hooks

`noskills invoke-hook <event>` is the port of `commands/invoke-hook.ts`, on
`pkg/ajan/noskillsfx`:

- `pre-tool-use` refuses changes to the noskills section of `.eser/manifest.yml`
  and to `.eser/.state/bin/`, runs the git guard on shell commands, and gates
  file edits by the phase of the spec or session. It reads the payloads of
  Claude Code, Codex, Copilot CLI, Kiro and the OpenCode plugin and answers each
  in its own form; a denial exits with code 2.
- `stop` records an iteration in EXECUTING, unless `noskills run` holds the
  turn, and prints the restart notice at `maxIterationsBeforeRestart`.
- `post-file-write`, `post-bash` and `post-ask-user-question` write
  `files-changed.jsonl`, `noskills-calls.jsonl` and the ask token.
- `session-start` writes the git wrapper and prints the instruction the Go
  compiler gives for the current phase.
- `git-exec <git arguments>` is the check behind the git wrapper; a refusal
  exits with code 3.

An event the binary does not know answers nothing and exits 0, as the TypeScript
dispatcher does. The golden harness in `pkg/ajan/noskillsfx/golden` replays the
recordings of the TypeScript CLI against this binary, and
`pkg/ajan/noskillsfx/hook_parity_test.go` replays the answers of the TypeScript
predicates for a corpus of commands.

## The spec lifecycle

These commands run in Go, on the lifecycle functions of `pkg/ajan/noskillsfx`
that noskills-server and the FFI bridge call too. Their JSON is the TypeScript
CLI's, byte for byte, and they leave the same files:

- `init`: detects the project, asks for concerns and coding tools on a terminal
  (`--concerns=`, `--tools=`, `--non-interactive` and `--agent` skip the
  prompts), and writes `.eser/`, the noskills section of `.eser/manifest.yml`
  and the concern files, then syncs the files of the chosen coding tools (see
  below). `--non-interactive` skips the questions in the human mode too.
- `spec new`, `spec list`, and `spec <name>` with `next`, `approve`, `done` and
  `followup`; `spec <name>` alone prints its status. `spec --help` prints the
  subcommands.
- `next`, `status`, `approve` and `done`, with `--spec=<name>`. `next` takes
  `--answer=`, `--agent` and `--human`. The discovery base questions are asked
  together and the follow-ups one at a time (TASK-166). The `split` answer of a
  refinement splits the spec as `spec <name> split` does.
- `next --validate` and a manifest `validate` entry run in Go too: at the end of
  discovery and at the spec proposal the second agent runs on the aifx provider
  the entry names (claude-code, anthropic, openai, gemini, vertexai, ollama,
  opencode or kiro), in an empty temporary directory, and its result is stored
  in `.eser/.state/progresses/validations/<spec>.json` and repeated while the
  input stays the same; `--validate` runs it again. An unusable entry or an
  unknown agent gives a skipped validation with the TypeScript messages.

The spec state commands (TASK-258.1) run in Go as well, at the top level with
`--spec=<name>` or as `spec <name> <command>`:

- `block "reason"`, `reset`, `cancel`, `wontfix "reason"` and `reopen`. `cancel`
  and `wontfix` keep COMPLETED in the spec's own state file, return `state.json`
  to IDLE, set the status of `spec.md` and `progress.json` and append a
  `phase-change` event to `.eser/.state/events/events.jsonl`. `reset` works from
  EXECUTING, BLOCKED and COMPLETED, and clears the spec's state but not its
  files.
- `spec <name> review [--question=<n> --answer="text"]` and
  `spec <name> delegate <questionId> <userName>`, with their
  `delegation-answered` and `delegation-created` events; `approve` refuses while
  a delegation is pending.
- `spec <name> split [--into <name> "description"]...`, `revisit "reason"`,
  `ac`, `task` and `note` (`add "text"` or `list`), and `plan-export`, which
  writes `.claude/plan.md`.
- `spec <name> section [list]` prints the sections the completeness gate checks,
  and `section <id> fill "text"` or `section <id> na "reason"` resolves one in
  DISCOVERY or DISCOVERY_REFINEMENT (TASK-325): the text goes into `spec.md` and
  the placeholder in the spec's state file, and in `state.json` when it names
  the spec. An N/A reason needs 20 characters, as the gate does.
- `validate <spec>` prints the completeness report and exits 1 while sections or
  decisions are open; `free` prints the idle-mode note.

`-o json` (the default), `-o markdown` and `-o text` work for every command that
takes them: `next` and `ledger` print through the renderers of
`output/formatter.ts`, and `status` and `spec list` print their status lines. A
legacy `.eser/` layout (`.eser/.state/state.json`, `.eser/.sessions/`,
`.eser/.events/`) moves into `.eser/.state/{progresses,sessions,events}/` with a
notice on stderr, and `init` writes the commented `.eser/.gitignore`.

Where Go and TypeScript differ:

- An error the TypeScript CLI throws without catching (an answer under 20
  characters, a premise answer that is not JSON, an approval the completeness
  gate refuses) prints its stack trace and exits 1 there; the binary prints
  `noskills: <message>` on stderr and exits 1.
- A spec name with a path separator is refused instead of writing outside
  `.eser/specs/`.
- `init` keeps the other sections of `.eser/manifest.yml` as they are and
  rewrites only the noskills section; the TypeScript CLI re-serializes the whole
  file.
- `free` and `validate` name the command the manifest sets; the TypeScript
  commands always name the default `npx eser@latest noskills`.
- A legacy layout moves at the start of every lifecycle and spec state command
  but `free`, `validate`, `spec list` and `spec --help`, and while `init`
  scaffolds `.eser/`. The TypeScript CLI moves it on the first read of
  `state.json`, which some commands never make, and the TypeScript hooks move it
  too; the Go hooks do not.
- The validator reads the spec document inside the project root, so a state
  whose spec path leaves it gets a skipped validation; a provider error reads
  "returned an error" and a model that cannot be created reads "call failed",
  with aifx's messages. noskills-server and the FFI bridge do not run the
  validator.

The golden scenarios `lifecycle`, `lifecycle_concerns`, `spec_new`,
`init_tools`, `init_bare`, `spec_states`, `spec_execution`, `spec_split_answer`,
`legacy_layout` and `next_validation` in `pkg/ajan/noskillsfx/golden` replay
recordings of the TypeScript CLI against the binary with
`NOSKILLS_NO_FORWARD=1`; `cmd/noskills/next_validation_test.go` runs a reviewed
validation against a fake aifx provider.

## The run loop

`noskills run [--spec=<name>] [--unattended] [--max-iterations=N] [--max-turns=N]`
is the port of `commands/run.ts`. It starts from SPEC_APPROVED (moving the spec
to EXECUTING) or EXECUTING, and each iteration reads `state.json` again: it
stops with 0 on COMPLETED, asks for a resolution on BLOCKED (`--unattended`
appends the reason to `blocked.log` and exits 1), and otherwise runs one agent
turn. The turn goes through the aifx `claude-code` provider, which starts the
claude CLI over ACP (`pkg/ajan/acpfx` and its shim) in the project directory,
with the prompt the Go compiler builds for a headless turn on stdin. The loop
records the iteration when the turn returns and claims the turn first
(`execution.driver` and `driverPid`), so the Stop hook inside the agent does not
record it again. While `allowGit` is false the git wrapper is first on the
agent's PATH, and `autoCommit: true` commits after each turn with the real git.
After `--max-iterations` (50) iterations it exits 2.

The agent's text and the names of the tools it calls stream to stdout as they
arrive, indented four spaces, with control characters removed. Ctrl-C cancels
the turn: the agent process is killed, the turn is not recorded, the claim is
released, PATH is restored, and the command exits 130.

Where Go and TypeScript differ:

- The TypeScript loop prints nothing of the agent's turn, and Ctrl-C ends it
  without releasing the claim; the Stop hook ignores a claim whose process is
  gone.
- The claim, the start of execution, a BLOCKED resolution and each recorded
  iteration are written to the spec's own state file as well as `state.json`.
  The TypeScript loop writes only `state.json`, which the agent's next
  `spec <name> next` or `block` overwrites from the spec's file, losing the
  claim and the recorded count.
- A turn is recorded only while the spec is still EXECUTING, as the Stop hook
  does; the TypeScript loop also records a turn that blocked or finished the
  spec.
- A spec the agent finished with `spec <name> done` ends the loop with "Spec
  completed!" and 0. `done` leaves `state.json` IDLE, and the TypeScript loop
  stops there with "Unexpected phase: IDLE" and 1.
- Exit code 2 means the loop ran out of iterations. The TypeScript loop also
  returns 2 when its last allowed iteration stopped for another reason.
- The BLOCKED resolution is a one-line prompt, and `run --help` prints the usage
  instead of starting the loop.

`cmd/noskills/run_test.go` runs the loop against a fake aifx provider factory,
and `run_binary_test.go` runs the built binary against a fake `claude` on PATH,
SIGINT included. With `NOSKILLS_RUN_PARITY=1` and node on PATH, it also runs the
TypeScript CLI on the same fixture and compares the output and the files. The
prompt is compared with the TypeScript one in
`pkg/ajan/noskillsfx/lifecycle_run_test.go`.

## Sync, purge and the state commands

The sync adapters of `pkg/@eserstack/noskills/sync` are ported to
`pkg/ajan/noskillsfx` (`sync_*.go`) and write the same bytes: CLAUDE.md, the
Claude Code hooks and agents; `.cursorrules`, `.windsurfrules` and
`.github/copilot-instructions.md`; the Kiro steering files, hooks, agents, spec
copies and MCP config; the AGENTS.md section, the OpenCode plugin, agents,
skills and MCP config; the Codex hooks, agents and MCP table; the Copilot CLI
hooks, agents and MCP config. They keep the user's own content in the files they
share (the marked sections, other hooks, other MCP servers, other TOML tables).

- `init` and `sync` (which says it was merged into init and runs it) sync the
  tools themselves; nothing runs the TypeScript CLI any more.
- `purge` moves each category (concerns, specs, rules, the manifest's noskills
  section, the agent integration) into `.eser/.state/purge-history/<entry>/`,
  keeps the newest 5 entries, and with `--no-history` deletes instead. Without
  `--force` it asks per category; in agent mode it needs `--force`.
- `purge restore [entry_id|latest] [category ...] [--overwrite]` lists the
  history, or restores the chosen categories (TASK-167): content that exists is
  left alone unless `--overwrite` is given, and the agent integration comes back
  through the sync. In a terminal it asks which entry and categories.
- `ledger <spec>` and `spec <name> ledger` print the decision ledger and summary
  (`--format=measurement-draft` for the measurement draft).
- `learn` (`list`, `remove <n>`, `promote <n>`) and `spec <name> learn "text"`
  (`--rule`, `--type=`, `--severity=`).
- `rule add | list | promote`, `concern add | remove | list [--json]`.
- `pack list | install | uninstall | inspect | search`, with the built-in packs
  embedded from `defaults/packs` and remote packs from
  `raw.githubusercontent.com`; `search` reads the `packRegistry` URL of the
  manifest.

The built-in concerns and packs are embedded with `go:embed` from
`pkg/ajan/noskillsfx/defaults`; tests keep them equal, byte for byte, to
`pkg/@eserstack/noskills/defaults`. `pkg/ajan/noskillsfx/golden` compares every
adapter's files with the TypeScript sync's for fixture projects
(`sync_adapters_test.go`) and replays the `state_commands`, `purge_selective`,
`init_active_spec`, `purge_restore` and `sync` recordings.

Where Go and TypeScript differ here:

- `learn list` prints each learning's icon and `[type]`; the TypeScript command
  prints `[object Object]` for both.
- `rule`, `concern`, `pack` and `ledger` name the command the manifest sets in
  their messages; the TypeScript commands always name the default
  `npx eser@latest noskills`.
- `purge` moves the noskills section of `.eser/manifest.yml` as text and leaves
  the rest of the file as written; the TypeScript CLI prints the whole file
  again through its YAML library. A manifest the YAML reader refuses gets that
  reader's message.
- A remote pack whose name, rule, concern id or folder rule would write outside
  `.eser/rules/`, `.eser/concerns/` or the project is refused (through `os.Root`
  for the folder rules), and each fetched file is read up to 1 MiB.
  `pack uninstall` removes only files inside those folders.
- `pack search` refuses, when it dials, a registry host whose address is
  internal, so a host name that resolves to one is refused too.
- `ledger` with a spec name that holds a path separator reads nothing.
- A `.claude/settings.json` or `opencode.json` that holds JSON `null`, or a
  manifest without a `tools` list, counts as empty; the TypeScript CLI throws.
- Failure messages that quote the file system read as Go's, not Node's.

## Sessions, the user identity and diagrams

These run in Go, on `pkg/ajan/noskillsfx` (`session.go`, `identity.go`,
`diagrams.go`):

- `session start --spec=<name> | --free | --auto` writes
  `.eser/.state/sessions/<id>.json` with the TypeScript record: `spec` and
  `phase` are `null` in free mode, and `--auto` binds the one active spec or
  starts a free session. The three flags exclude each other, and `--spec=` needs
  a name. `pid` is 0, for no owning process: `session start` exits as soon as it
  prints the export lines, so its own pid would name a dead process.
  `session list`, `session end [--id=]` (or `NOSKILLS_SESSION`; exit 1 when
  there is no such session) and `session gc` (idle for more than two hours) work
  on those files. A session whose `lastActiveAt` is not a date lists as
  `unknown` and counts as stale. `next` with `NOSKILLS_SESSION` set rewrites the
  session's phase and `lastActiveAt` and keeps every other field, `pid` and
  `startedAt` included.
- `config set-user --name= --email= | --from-git`, `config get-user` and
  `config clear-user` manage `user.json` in `$XDG_CONFIG_HOME/eser/noskills`, or
  `~/.config/eser/noskills` from `HOME` (or `USERPROFILE`) when the variable is
  unset or empty; with none of them set, writing or removing it fails.
  `user.json` is written with mode 0600 in a 0700 directory. Every answer,
  transition, approval and spec creation is attributed through the same
  `ResolveUserWith`: `user.json`, then git's `user.name` and `user.email`, then
  "Unknown User".
- `diagrams scan | list | check | verify <file> [--line=N]` keep the registry in
  `.eser/diagrams.json`: the mermaid blocks and box drawings of every markdown
  file outside dot folders and `node_modules`, and the `.puml` files at the top
  level. `scan` needs an initialized project. A box drawing is one entry, and a
  file path such as `src/login.ts` is not also taken as the module `src/login`.
  A diagram that names a file in `execution.modifiedFiles` is stale, once
  however many of its files changed, and `next` in COMPLETED reports it with
  `staleDiagramsBlocking`.

The golden scenarios `sessions`, `user_identity` and `diagrams` replay
recordings of the TypeScript CLI; the harness replaces the random session ids
with numbered placeholders and gives each run its own `HOME`, so no test reads
or writes the real `~/.config`.

Where Go and TypeScript differ here:

- A registry or session that cannot be written prints `noskills: <message>` and
  exits 1; the TypeScript CLI throws.
- The git identity lookup gives up after 10 seconds.
- The diagram scan reads through `os.Root` and lists directories in name order:
  a symlinked file or folder is not followed, as the TypeScript scan does not
  follow it either, and nothing outside the project can be read. A registry that
  is not a JSON list reads as empty.

## The other commands

`watch` (the read-only live dashboard, `-o json` or `-o markdown`), `manager`
(`mgr`) and `web` stay in the TypeScript CLI until M5 (TASK-266). They, and any
other first word, including flags before a command, go to the TypeScript CLI
with their arguments as given, found in this order:

1. `NOSKILLS_TS_CLI`, a command line split on whitespace, such as
   `node /path/to/pkg/@eserstack/noskills/main.ts`;
2. `NOSKILLS_TS_BUNDLE`, the TypeScript CLI bundle that the npm `noskills`
   launcher ships and sets, run with the `node` on PATH;
3. `npx --yes noskills@<version>`.

The npm `noskills` package is the launcher of this binary (TASK-261), so step 3
runs the binary again, with `NOSKILLS_TS_BUNDLE` set this time. The npx run gets
`NOSKILLS_VIA_NPX=1`, and a binary that finds it set does not take step 3 again,
so a launcher without its bundle cannot start a loop. A `noskills` in
`ESER_PLUGIN_PATH` is not looked at: the eser npm launcher points that variable
at the noskills launcher, which runs this binary too.

`NOSKILLS_NO_FORWARD=1` turns this off, so a test can show that a command ran in
Go.

The forwarded CLI gets `NOSKILLS_CLI_PREFIX` set to the command that runs this
binary: `noskills` when that name on PATH is this file, its absolute path
otherwise. `noskills init`, which runs in Go, writes the same command into the
manifest, so every hook and the git wrapper it generates call the Go binary
instead of `npx eser@latest noskills`. A project initialized with the npx
command switches when `noskills init` runs again through the binary. A
`NOSKILLS_CLI_PREFIX` you set yourself stays as it is.

Hooks written by v4.5.x call `npx eser@latest noskills invoke-hook ...`. The
eser launcher of M3-T11 (TASK-254) forwards them to a `noskills` on PATH or in
`ESER_PLUGIN_PATH`, and `npx noskills` runs the npm launcher of this binary, so
they reach this binary either way.

## Installing

Every channel installs this binary (TASK-261):

- `install.sh` and `install.ps1` (`-Product noskills`), Homebrew
  (`brew install eser/tap/noskills`) and the release archives
  `noskills-v<version>-<triple>`, which `eser dev compile` builds and which
  installed v4.5.x noskills binaries self-update to;
- Nix: `nix build .#noskills` builds it from source with `buildGoModule`
  (`vendorHash` is kept by `eser dev nix-vendor-hash`);
- npm: `npm i -g noskills` or `npx noskills` installs the launcher, which runs
  the binary of the optional dependency `@eserstack/noskills-<platform>` for
  darwin-arm64, darwin-x64, linux-arm64, linux-x64 or win32-x64, and fails with
  the list of those on another platform.

`cmd/noskills/install_dry_run_test.go` installs it with install.sh, install.ps1
and the Homebrew formula from a local release.

## Links

- [noskills](../../pkg/@eserstack/noskills/README.md): the TypeScript CLI and
  how its hooks work
- [ajan/noskillsfx](../../pkg/ajan/noskillsfx): the Go port the hooks run on
- [ajan/clifx](../../pkg/ajan/clifx/README.md): the command tree and help
