# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

### Migration

Breaking changes since 4.5.2, grouped by package, each with the change you make
to upgrade. The TypeScript packages come first, then the Go packages under
`pkg/ajan/`, the native bridge, and the recipes. Changes that only fix a bug and
need nothing from you are not listed.

#### @eserstack/noskills

Run `noskills init` (or `eser noskills init`) once after upgrading. It rewrites
the hook files, the generated rule files and the copies of the built-in concerns
in `.eser/concerns/`, which several entries below depend on.

- `noskills invoke-hook pre-tool-use` refuses a call with exit code 2 and writes
  `noskills: <reason>` to stderr. It used to exit 0 with JSON only; the JSON is
  still on stdout for Claude Code, Codex and Copilot CLI. A script that calls
  the hook treats 2 as a denial:

  ```bash
  noskills invoke-hook pre-tool-use < tool_call.json
  # Before: any non-zero exit meant the hook crashed
  # After: 0 allows the call, 2 refuses it, anything else is a failure
  ```

- Kiro hooks moved from `.kiro/settings/hooks.json`, which Kiro does not read,
  to `.kiro/hooks/noskills.json` in Kiro's v1 format. `noskills init` writes the
  new file and removes noskills' `_noskills` entries from the old one, deleting
  it when nothing else is left. Kiro IDE 1.0 or CLI 3.0 is needed.
- `.codex/hooks.json` uses Codex's event-to-matcher-group format. Codex no
  longer gets a post-ask-user-question hook and now gets a post-bash hook. Run
  `noskills init`, which also converts your own entries, then open `/hooks` in
  Codex and trust the noskills hooks:

  ```jsonc
  // Before: a list of entries
  {
    "hooks": [
      { "event": "PreToolUse", "command": "noskills invoke-hook pre-tool-use" }
    ]
  }
  // After: events map to matcher groups
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "^(Bash|apply_patch)$",
        "hooks": [{
          "type": "command",
          "command": "noskills invoke-hook pre-tool-use",
          "timeout": 30
        }]
      }]
    }
  }
  ```

- `.github/hooks/noskills.json` uses Copilot CLI's camelCase event lists
  (`"preToolUse": [{ "type": "command", "matcher": "...", "command": "...", "timeoutSec": 30 }]`)
  instead of named objects such as `"noskills:preToolUse"` with a `command`
  array, which Copilot CLI rejected. `noskills init` drops the old keys.
- The OpenCode plugin `.opencode/plugins/noskills.ts` exports `NoskillsPlugin`
  instead of `export default`, runs the stop hook on `session.idle` instead of
  `session.deleted`, and refuses a guarded tool call when the PreToolUse check
  times out, fails or cannot start. Run `noskills init`. If the noskills command
  can be missing on a machine, install it there, or remove the plugin file
  (`noskills purge` now removes it).
- In agent mode, `noskills next` in DISCOVERY returns every unanswered base
  question in `questions`, and `currentQuestion` is gone from the output and
  from the `compiler.DiscoveryOutput` type. Send the answers as one JSON object
  keyed by question id; plain text still answers the first open question. Run
  `noskills init` (or sync) so the generated rule files state the new rule:

  ```bash
  # Before: one call per question, read from currentQuestion
  noskills spec checkout-flow next --answer="Orders are copied by hand"
  # After: one call with every answer
  noskills spec checkout-flow next --answer='{"status_quo":"Orders are copied by hand","ambition":"..."}'
  ```

- A JSON answer that holds only some base question ids records those answers; it
  used to be stored, as a whole string, as the answer to the current question. A
  JSON answer whose key is not a base question id, whose value is not a string,
  or that holds no answer is refused with `{error}` and exit code 1. Key each
  answer by `status_quo`, `ambition`, `reversibility`, `user_impact`,
  `verification` or `scope_boundary`.
- Pending follow-ups now keep the base answers from completing discovery. `next`
  hands them out one at a time, and settling the last one moves the spec to
  DISCOVERY_REFINEMENT. `followup <id> --answer` and `--skip` on an id that is
  not a pending follow-up fail with exit code 1 instead of reporting success.
  Register follow-ups before you submit the base answers, then run the command
  `next` gives for each one:

  ```bash
  noskills spec checkout-flow followup status_quo "Which teams copy orders?"
  noskills spec checkout-flow next --answer='{"status_quo":"...",...}'
  noskills spec checkout-flow followup followup_id --answer="Support and sales"
  ```

- The ask-token file (`.eser/.state/progresses/ask-token.json`) holds a `steps`
  list, each step named by question id, instead of top-level `stepId` and
  `match` fields. noskills still reads tokens in the old format; a tool that
  reads the file itself reads `steps[i].stepId` and `steps[i].match`.
- `ConcernDefinition.reminders` entries are `string | { text, scope? }`
  (`ConcernReminder`). Read them through the helpers, which accept both shapes;
  concern JSON with plain strings loads unchanged:

  ```typescript
  import * as noskills from "@eserstack/noskills/mod";

  // Before: const text = concern.reminders[0];
  const text = noskills.concerns.reminderText(concern.reminders[0]);
  const scope = noskills.concerns.reminderScope(concern.reminders[0]);
  ```

- noskills no longer guesses where a reminder applies from words in its text
  ("slop", "ui element", "api doc", "migration", "rollback" and others). A
  custom concern that relied on those words now puts those reminders in every
  spec's EXECUTING instruction, and nothing is file-specific without a `scope`.
  Add the scope (`ui`, `api`, `data` or `migration`) to those reminders, and run
  `noskills init` to rewrite the built-in concern copies in `.eser/concerns/`,
  or beautiful-product's UI reminders reach every spec:

  ```jsonc
  // Before
  "reminders": ["Every UI element has an empty state"]
  // After
  "reminders": [
    { "text": "Every UI element has an empty state", "scope": ["ui"] }
  ]
  ```

- Built-in concerns changed where their content applies. Three beautiful-product
  reminders (empty states, landing page rules, design rating rubric) and
  qa-tested's Health Score Rubric now need a `ui` spec, and compliance's three
  PII and data reminders a `data` spec. developer-experience DX Principle 1 and
  documented's migration-guide reminder need `involvesMigration`. peer-reviewed
  Suppressions, ship-ready CHANGELOG, deploy-ready Rollback plan and
  production-ready Runbook moved from the per-edit hook into the EXECUTING
  instruction. The sections compliance data-handling and retention-policy
  (`data`), documented api-documentation (`api`) and long-lived
  migration-deprecation (`migration`) stay hidden until the classification has
  the flag. A spec already in flight shows the change when its classification is
  next applied. Run `noskills init` to refresh the copies in `.eser/concerns/`.
- A scoped reminder delivered per file also needs the spec's flag: a `ui`
  reminder is no longer added for a `.tsx` edit in a spec without
  `involvesWebUI`, and an `api` reminder is now added for a source file while
  the spec has no classification yet. No change needed.
- A concern file with an unknown or malformed `scope`, such as `"UI"` or a value
  that is not a list, is refused: `persistence.listConcerns` skips it with a
  stderr warning naming the file and entry, `concerns.loadConcerns` throws, and
  `noskills pack install` of a remote pack stops. Before: `"scope": "UI"`.
  After: `"scope": ["ui"]`, with values from `ui`, `api`, `data` and
  `migration`.
- `SpecSectionDefinition.condition` is optional and `SpecSection` has a new
  `scope` field. A legacy `condition` that names no classification flag now also
  hides the section in `template.renderSpec`, as `living.ts` already did. No
  change needed for valid conditions.
- `noskills purge` moves what it removes into
  `.eser/.state/purge-history/<entry_id>/` and keeps the 5 newest entries,
  instead of deleting it. To remove the content from disk, pass `--no-history`,
  and delete `.eser/.state/purge-history/` to drop copies from earlier purges.
  Before: `noskills purge --force`. After:
  `noskills purge --force --no-history`.
- `noskills purge` refuses arguments it does not know, with exit code 1; it used
  to ignore them. Only `--force`, `--no-history`, the mode flags and the
  `restore` subcommand are accepted. Drop any other argument.
- `noskills purge` exits with code 1 when a category could not be fully removed,
  and names each path and the reason; it used to exit 0 and say nothing. A
  script treats exit 1 as a partial purge and reads the output.
- Purge's `agent-integration` category takes more files: the agent files for
  Codex, Copilot CLI, Kiro and OpenCode, Kiro's `noskills-*` steering files, the
  `.kiro/specs/<spec>/` and `.opencode/skills/<spec>.md` copies of each spec,
  noskills' section of AGENTS.md, and the noskills MCP server in
  `.codex/config.toml`, `.copilot/mcp.json`, `.kiro/settings/mcp.json` and
  `opencode.json`. A shared file left empty, such as a CLAUDE.md that only held
  the noskills section, is deleted, and so is a folder purge leaves empty. To
  get a file back, run
  `noskills purge restore latest manifest agent-integration`.
- Interactive `noskills purge` also asks about the workflow state
  (`.eser/.state/progresses/`) when no spec exists, and asks about the agent
  integration for any tool, not only Claude Code. No change needed.
- The PreToolUse hook refuses agent edits and Bash commands that change the
  `noskills` section of `.eser/manifest.yml`, leave the manifest unparseable,
  write under `.eser/.state/bin/`, or move or remove `.eser` or `.eser/.state`
  as a whole (`rm -rf .eser/.state`, `mv .eser x`), in every phase and session
  mode. Change that section yourself, run `noskills concern add` or
  `concern remove`, and use `noskills purge` for cleanup.
- The git guard applies to every Bash call, also when `NOSKILLS_SESSION` names a
  session that does not exist or a spec session with no spec, and a file edit
  under such a session is gated by the project state instead of allowed. Point
  `NOSKILLS_SESSION` at a live session, or start a free-mode session for ungated
  edits.
- With `allowGit` false, agent sessions (Claude Code through the SessionStart
  hook, and `noskills run`) refuse at exec time every git write to the project's
  repository and every push from any repository. That includes writes started by
  tools, such as `gh pr create`, `npm version` or lint-staged. A git command
  whose first argument is a global option the guard does not know (such as
  `--list-cmds=...`) is refused too. Set `allowGit: true` in
  `.eser/manifest.yml`, or run those commands outside the agent session.
- `allowGit` counts as on only when it is the boolean `true`, in the hooks,
  `noskills run` and `noskills sync`. Before: `allowGit: "yes"` turned the guard
  off. After: write `allowGit: true`.
- The git wrapper refuses a command when the noskills check does not answer
  within 30 seconds; it used to wait with no limit. If the check is slow because
  `command` is `npx eser@latest noskills`, set `command` in `.eser/manifest.yml`
  to an installed noskills, such as `eser noskills`.
- `noskills run` commits whenever `autoCommit: true` is set, also when
  `allowGit` is false. Its commits include untracked files, run at the project
  root and use the message `noskills: iteration N: <progress>`. Set
  `autoCommit: false` (or remove it) to keep the loop from committing.
- The session-start hook prints Claude Code's hook JSON instead of the compiled
  `noskills next` JSON. Claude Code and Codex read it natively; another reader
  takes `hookSpecificOutput.additionalContext` and strips its first line, or
  calls `noskills next` itself. Before: `{"phase":"DISCOVERY",...}`. After:
  `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"[noskills] The current noskills state and instruction for this project:\n{...}"}}`.
- The PreToolUse hook's sub-agent reminder is in the hook's stdout JSON as
  `additionalContext` instead of on stderr. Read the JSON instead of scraping
  stderr.
- `noskills pack search` refuses a `noskills.packRegistry` that is not https
  (http only for loopback hosts), carries a user name or password, names an
  internal IP address, or redirects. Documents over 1 MiB, non-JSON documents
  and malformed entries are rejected and reported. Serve the registry over https
  at its final URL with entries that match `PackRegistryEntry`.
- `noskills spec <name> split` and the `split` answer to `next` refuse a child
  name that repeats or belongs to an existing spec, and create nothing; they
  used to overwrite that spec's state. Pick other names:
  `noskills spec checkout-flow split --into checkout-api "API" --into checkout-ui "UI"`.
- Generated `.cursorrules`, `.windsurfrules` and
  `.github/copilot-instructions.md` use `<prefix> spec <name> next` forms. Run
  sync again instead of editing the generated files.
- `noskills next` JSON no longer has `behavioral.urgency` or
  `restartInstruction`, and the TypeScript types `compiler.BehavioralBlock` and
  `compiler.ExecutionOutput` lost the fields. Read `restartRecommended` on the
  EXECUTING output and show your own notice. `behavioral.modeOverride` for
  DISCOVERY, DISCOVERY_REFINEMENT and SPEC_PROPOSAL is "plan mode", and the
  read-only rule appears once in `behavioral.rules`.
- `persistence.resolveState` and `persistence.requireSpecFlag` require the
  command prefix, and `resolveState`'s `specName` is no longer optional (pass
  `null` for the active state). A missing spec throws `SpecNotFoundError`, which
  has a `specName` field:

  ```typescript
  import * as noskills from "@eserstack/noskills/mod";

  // Before
  const state = await noskills.persistence.resolveState(root);
  // After: pass the manifest's `command`
  const state = await noskills.persistence.resolveState(
    root,
    null,
    "eser noskills",
  );
  ```

- Mixed versions: noskills-server and the `nextNoskillsStep` export of the
  native library return the new DISCOVERY and EXECUTING shapes (see
  `pkg/ajan/noskillsfx` below). Upgrade `@eserstack/noskills`, `@eserstack/ajan`
  and noskills-server together.

#### @eserstack/noskills-client

- `storeCertFingerprint` and `loadCertFingerprint` take the daemon's base URL.
  Entries cached under the old `active` key are not read; the next attach
  fetches the fingerprint again:

  ```typescript
  import * as noskillsClient from "@eserstack/noskills-client";

  // Before: await noskillsClient.storeCertFingerprint(fingerprint);
  await noskillsClient.storeCertFingerprint(
    "https://localhost:4433",
    fingerprint,
  );
  ```

- `fetchAndPinCertFingerprint` and `getCertFingerprint` return `null` only when
  the daemon answers 404. A network error, another error status, a body that is
  not JSON or an invalid fingerprint throws `CertFingerprintError`, and a
  timeout throws `NoskillsTimeoutError`. Catch these where `null` used to mean
  "no pin".
- `storeCertFingerprint` throws `RangeError` for a value that is not 64 hex
  digits (colons and spaces are allowed), and `attachSession` for a `certHash`
  or `config.certHashes` entry that is not 32 bytes. Pass real SHA-256
  fingerprints.
- `attachSession` pins every `config.certHashes` entry, not only the first. Drop
  old hashes from the list if they must not be accepted any more.
- REST calls time out after 10 s (`registerProject` with a git URL: 300 s), and
  `attachSession` after 10 s, with `NoskillsTimeoutError`; they had no limit.
  Set `config.timeoutMs`, or pass `{ timeoutMs }` per call or in
  `AttachOptions`.

#### @eserstack/noskills-web

- `MuxHost` no longer has a public `server` field. Connect a browser WebSocket,
  after authenticating it, with `host.attachSocket(socket)`. Code that drove the
  mux server directly (`dispatch`, `getState`, `dispose`) creates its own with
  `mux.createServer` from `@eserstack/mux`.
- The spec page no longer shows a Start Execution button for a SPEC_APPROVED
  spec; it always answered 400 `Unknown action: start`. Start execution from the
  agent with `noskills spec <name> next`, or with `noskills run`.
- A route that throws answers 500 JSON
  `{ ok: false, error: "Request could not be completed", requestId }` instead of
  the runtime's default 500, and an `Action could not be completed` fault
  carries `requestId`. Use `requestId` to find the server log record.
- Server errors are written as `@eserstack/logging` records (JSON lines on
  stderr, category `noskills-web`) instead of `[noskills-web] reason: <error>`
  console lines. Read the JSON records, or pass your own `logger` to
  `startServer`.
- Ctrl+C runs the graceful shutdown on Node and Bun too, and the SIGINT listener
  is removed once the server stops. An embedder that relied on Node's default
  Ctrl+C exit while the server runs gets the shutdown instead.

#### @eserstack/codebase

- `versions()` rejects with `VersionWriteError` (with `targetVersion` and
  `failures`) when a `package.json` or `deno.json` could not be written, and
  does not write `VERSION`. It used to resolve and report those packages as
  updated. Catch it, fix the listed files, then rerun with the explicit target:

  ```bash
  # Before: a failed write still reported success
  eser codebase versions minor
  # After: fix the files in error.failures, then pass error.targetVersion
  eser codebase versions target_version
  ```

- Validator help, `gh --help`, the `--write-baseline` result line of
  `validate-code-conventions` and `validate-runtime-js-apis`, and the output of
  `validate-docs`, `validate-mod-exports`, `validate-export-names`,
  `validate-package-configs`, `validate-circular-deps`, `validate-commit-msg`
  and the standalone `commitmsg` entry go through the shared CLI context. When
  stdout is not a TTY, that output is plain text on stderr instead of stdout.
  Capture both streams: `eser codebase validate-docs > report.txt` becomes
  `eser codebase validate-docs > report.txt 2>&1`.
- `eser codebase versions` prints its tables as plain aligned tables through the
  CLI context instead of `console.table` on stdout, with the columns
  name/version and name/from/to/changed and no index column. Capture with `2>&1`
  and parse the new columns, or call `versions()` or `showVersions()` and read
  the result object.
- Importing `@eserstack/codebase/validate-commit-msg` no longer starts loading
  the native bridge. A caller of the synchronous `validateCommitMsg()` gets the
  TypeScript rules (with different wording) unless the bridge is loaded first:

  ```typescript
  import * as ffiClient from "@eserstack/ajan/ffi/client";
  import * as commitMsg from "@eserstack/codebase/validate-commit-msg";

  await ffiClient.ensureLib(); // After: load the bridge before validating
  const result = commitMsg.validateCommitMsg("fix(cli): keep quoted args");
  ```

- For every file-tool validator, an empty `--exclude` value (a trailing
  `--exclude` or `--exclude=`) fails with exit code 1; it used to match every
  path, so nothing was checked. Repeated `--exclude` flags all apply, where only
  the last one did. Pass real patterns and drop extra flags you relied on being
  ignored.
- `validate-runtime-js-apis` also reports `process.*`, `globalThis.process.*`
  and `Bun.*`, always runs the TypeScript check (no Go delegation), and skips
  test files and `standards/cross-runtime/` on its own. Its message is now
  `direct Deno API usage: X; use Y from @eserstack/standards/cross-runtime`.
  Switch to `runtime` from `@eserstack/standards/cross-runtime`, list scripts
  that run on one runtime by design in the step's `exclude`, or record existing
  uses with `eser codebase validate-runtime-js-apis --write-baseline`.
- `validate-code-conventions` has an `export-star` rule: `export * from` and
  `export type * from` fail unless the baseline allows them, and `||` defaults
  inside template `${...}` interpolations are reported. Replace each with named
  re-exports or `export * as name from`, or record existing ones with
  `eser codebase validate-code-conventions --write-baseline`:

  ```typescript
  // Before
  export * from "./parser.ts";
  // After
  export { parse, type ParseOptions } from "./parser.ts";
  ```

- `eser update` on Windows extracts with `%SystemRoot%\System32\tar.exe` instead
  of PowerShell `Expand-Archive`, which needs Windows 10 1803 or Windows Server
  2019 or later.

#### eser CLI (@eserstack/cli)

- Manifest scripts receive each forwarded argument as exactly one word, with
  `$VARS`, globs, `;` and `$()` kept literal; the shell no longer re-parses
  them. Pass separate words as separate arguments, and put any expansion in the
  script's command in `.eser/manifest.yml`:

  ```bash
  # Before: "--filter x" was split into two words
  eser test "--filter x"
  # After
  eser test --filter x
  ```

- Manifest scripts with `depends` run those dependencies first, in post-order
  and once each; they used to be skipped without notice. Remove any `depends`
  entry you do not want to run.
- A malformed manifest script entry stops the run with exit code 1 and a message
  naming the field: `null`, a list, an object without a `command` string, a
  non-string `description` or `workingDirectory`, or a `depends` that is not a
  list of names. Before: `depends: build`. After: `depends: [build]`.
- A failing dependency is reported on stderr as
  `script "<name>" did not run: its dependency "<dep>" exited with code N`
  instead of the stdout line `Script dependency ... failed`. Tools that read
  that line read stderr.
- The `bin.ts` entry point (the deno and JSR installs) exits non-zero and prints
  the failure message when a command fails; it used to exit 0 on every run.
  Scripts see the real exit code.

#### @eserstack/workflows

- `run.main()` returns the usage errors
  (`specify -e <event> or -w <workflow-id>`, `no .eser/manifest.yml found`) as
  `error.message` of the failed `CliResult` instead of writing them to stderr. A
  direct caller prints the message:

  ```typescript
  import * as primitives from "@eserstack/primitives";
  import * as run from "@eserstack/workflows/run";

  const result = await run.main(["-e", "precommit"]);
  if (primitives.results.isFail(result)) {
    console.error(result.error.message); // After: print it yourself
  }
  ```

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

#### @eserstack/ai

- `ContentBlock` has a `ThinkingBlock` (`kind: "thinking"`), `StreamEvent` a
  `ThinkingEvent`, and `StopReason` the value `"refusal"`. An exhaustive
  `switch` over them without a `default` no longer compiles. Add the cases, and
  treat `"refusal"` as a declined request, not an answer:

  ```typescript
  // After: check for a refusal before you use the text
  if (result.stopReason === "refusal") {
    return reportRefusal(result);
  }
  ```

- Stop reasons: Anthropic `refusal`, OpenAI `content_filter` and
  `message.refusal`, Gemini and Vertex AI safety, blocklist and recitation
  reasons and blocked prompts, the claude-code CLI's `refusal`, and ACP
  `refusal` are now `"refusal"`; they used to be `"end_turn"` or `"stop"`.
  Anthropic `model_context_window_exceeded` is `"max_tokens"`. Gemini and Vertex
  AI turns that call a tool end with `"tool_use"`, and unknown OpenAI and Gemini
  reasons are `"stop"`. Check for `"refusal"` before you use the text, and
  accept `"tool_use"` where you compared with `"end_turn"` after a tool call.
- A `json_schema` `responseFormat` with a missing or non-object schema fails
  before sending with `BadRequestError`, on every provider; it used to be sent
  without the schema. Anthropic now sends the schema as `output_config.format`,
  so a schema outside the subset Claude accepts (for example an object without
  `additionalProperties: false`) gets a 400 from the API. Pass a JSON Schema
  object that follows the provider's limits, or use `json_object`:

  ```typescript
  const options = {
    // Before: { type: "json_schema" } was accepted and the schema ignored
    responseFormat: {
      type: "json_schema",
      jsonSchema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
  };
  ```

- claude-code with a `json_schema` format passes `--json-schema` to the CLI, and
  `generateCommitMessage` on claude-code passes `--effort low`; a claude CLI
  without these flags rejects the call (2.1.289 has them). The reply text is the
  structured output, and `streamText` yields it as one `content_delta` after the
  CLI exits. Update the claude CLI, and parse `ai.text(result)` as JSON.
- Capabilities: Anthropic models declare `structured_output` and `reasoning`;
  the Gemini bridge model declares `audio`, `structured_output` and `reasoning`,
  the OpenAI bridge model `audio`, and the Vertex AI bridge model no longer
  declares `batch_processing`. `getByCapability("batch_processing")` no longer
  returns a Vertex AI bridge model, which never had batch methods.
- `aiTextSource` (`@eserstack/ai/streams`) fails its stream with the error of a
  `streamText` error event; it used to end normally with partial text. Handle
  the rejection of `pipeline().run()`, or use `aiSource` to receive error events
  as data.
- `eser ai ask`: a value flag with no value (`-p`, `-m`, `--max-tokens`) and a
  `--max-tokens` that is not a positive whole number exit 1 with a message.
  Before: `eser ai ask -m` ignored the flag. After: pass a value, as in
  `eser ai ask "your prompt" -m your_model_id`.

#### @eserstack/kit

- `eser kit clone` in whole-repo mode fails when the GitHub tarball expands past
  256 MiB or holds more than 20,000 entries, counting entries outside a subpath.
  Raise the limits for a larger template:
  `eser kit clone gh:owner/repo --max-bytes 536870912 --max-entries 40000`, or
  set `ESER_KIT_MAX_BYTES` and `ESER_KIT_MAX_ENTRIES`.
- Tar entries that are not regular files (symlinks, hard links, devices, pax and
  GNU metadata) are skipped, and zero-byte files such as `.gitkeep` are now
  written. A template that relied on a symlink creates it in a post-install
  command.
- Post-install commands stop after 10 minutes
  (`DEFAULT_POST_INSTALL_TIMEOUT_MS`) and fail with `PostInstallError`
  (`exitCode` null, `timeoutMs` set); they used to run without limit. A recipe
  that needs longer passes a larger limit:

  ```typescript
  import * as recipes from "@eserstack/kit/recipes";

  await recipes.applier.applyRecipe(recipe, {
    cwd: ".",
    registryUrl,
    postInstallTimeoutMs: 30 * 60 * 1000, // After: 30 minutes
  });
  ```

- The handler error types (`AddRecipeError`, `UpdateRecipeError`,
  `NewProjectError`, `CloneRecipeError`, `ListRecipesError`) have a required
  `cause: unknown` on their `RegistryError`, `ApplyError` and `FetchError`
  variants, and `message` is the multi-line cause chain. Code that builds these
  values, such as a test fake, adds `cause`. `add`, `new` and `update` report a
  registry load failure as `_tag: "RegistryError"` (it was `"ApplyError"`), and
  `clone` reports a `recipe.json` failure as `_tag: "FetchError"`. Match `cause`
  with `instanceof RegistryLoadError` or `RecipeLoadError` for details:

  ```typescript
  // Before
  if (error._tag === "ApplyError") reportRegistryProblem(error.message);
  // After
  if (error._tag === "RegistryError") reportRegistryProblem(error.message);
  ```

- `fetcher` and `applier` throw named classes instead of plain `Error` with
  message text: `RegistryLoadError`, `RegistryRequestError`, `RecipeLoadError`,
  `RecipeApplyError`, `RecipePathTraversalError`, `PostInstallError`, and a
  `TypeError` for a missing whole-repo specifier. `detectLocalRegistry` throws
  `RegistryLoadError` when a candidate path cannot be checked for a reason other
  than a missing file. Before: matching
  `error.message.includes("Could not reach registry")`. After:
  `error instanceof recipes.fetcher.RegistryLoadError`.
- Every kit command prints its failure message on stderr, and `eser kit new`
  without a template exits 1 when the registry cannot be loaded (it exited 0).

#### @eserstack/posts

- `eser posts login --password=...` (and a bare `--password`) fails with exit
  code 1, and `login` rejects unknown flags and positional arguments. Put the
  Bluesky credentials in the environment or in `.env.local`:

  ```bash
  # Before
  eser posts login --platform=bluesky --handle=you.bsky.social --password=your_app_password
  # After
  export BLUESKY_IDENTIFIER=you.bsky.social BLUESKY_APP_PASSWORD=your_app_password
  eser posts login --platform=bluesky
  ```

- `eser posts login --platform=twitter` waits up to two minutes for the loopback
  redirect (or a pasted redirect URL) and saves the tokens, instead of printing
  a URL and a `login-callback` hint. Complete the browser authorization while
  the command waits.
- `PostsConfig.ai.provider` is removed and `AI_PROVIDER` is no longer read;
  translation uses Anthropic whenever `ANTHROPIC_API_KEY` is set. Delete reads
  of `config.ai.provider` and any `AI_PROVIDER` setting.
- `loadPostsConfig()` returns `undefined` instead of `""` for an empty
  `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `BLUESKY_IDENTIFIER`,
  `BLUESKY_APP_PASSWORD` or `ANTHROPIC_API_KEY`. Before:
  `config.twitter.clientId === ""`. After:
  `config.twitter.clientId === undefined`.
- Setting `TWITTER_CLIENT_SECRET` makes X token requests send HTTP Basic client
  authentication. Set it only for a confidential X client; leave it unset for a
  public Native App client.
- `TwitterSocialApi` rejects post IDs that are not 1 to 19 decimal digits. Pass
  the numeric ID from the post URL, not the URL.
- `handlers.composeTweetHandler`, `translateAndPostHandler`,
  `postThreadHandler`, `getTimelineHandler` and `getUsageHandler`, called
  without a platform in a context that has `tokenStore` and `auths`, run inside
  `withFreshTokens` for the first platform in `ctx.auths`, and fail with
  `AuthRequiredError` when it has no saved tokens. Pass the platform, save
  tokens for the first platform, or leave `tokenStore` and `auths` out to manage
  tokens yourself.
- `handlers.composePostToAllHandler` without auth providers fails with
  `FanOutPartialError` when any platform fails, and fails when no platform is
  configured; it returned the successes, or `ok([])`. Handle
  `FanOutPartialError` (`posted`, `failed`, `totalPlatforms`) on this path too.
- `PostService.composePostToAll` publishes on one platform after another in
  connection order instead of all at once, so a cross-post takes the sum of the
  platforms' latencies.
- `handlers.searchPostsAllHandler` and `getUnifiedTimelineHandler` with auth
  providers ask each platform for 10 posts (`DEFAULT_MAX_RESULTS_PER_PLATFORM`)
  when `maxResultsPerPlatform` is not given. Pass it for another count.
- `FanOutPartialError` and `ThreadPartialError` messages changed. Match on
  `error.code` (`FANOUT_PARTIAL`, `THREAD_PARTIAL`) or `instanceof`, not on the
  text. When a thread stops partway, `eser posts thread` prints one error line
  with that message, then the published posts, instead of
  `Thread partially posted: k/n succeeded` and `Failed at index i: <cause>`.
- Agent tool responses: a failed `compose_post_all` returns
  `{ error, posted, failed }` and a failed `post_thread` returns
  `{ error, posted, failedIndex, cause }` instead of the message string, and
  `repost`, `undo_repost`, `bookmark_post` and `remove_bookmark` return
  `content: null` instead of `undefined`. Tool calls whose arguments do not
  match the schema (undeclared arguments, empty text or query, malformed post
  IDs) come back as `isError` without running. Code that reads
  `ToolCallResponse.content` handles these objects and `null`.
- `eser posts reply` without `--platform` replies on the first configured
  platform instead of always on X. Pass `--platform=twitter` to keep X.
- `BluekysSocialApi` is renamed `BlueskySocialApi`; the old name stays as a
  deprecated alias for one release.

#### @eserstack/shell

- A command that does not run to an exit code throws
  `shell.exec.CommandRunError`, even with `noThrow()`: a missing program or
  working directory, a request the native library rejects, or a timeout. On the
  runtime spawn path it used to be the runtime's own error
  (`Deno.errors.NotFound`, Node's `ENOENT`), now in `error.cause`; with the
  native library, `spawn()` used to retry through the runtime. A timeout on the
  runtime path used to be a `CommandError` with the killed process's exit code.
  Catch the new class:

  ```typescript
  import * as shell from "@eserstack/shell";

  try {
    await shell.exec.exec`git fetch origin`.timeout(30_000).spawn();
  } catch (error) {
    // Before: error instanceof Deno.errors.NotFound, or a CommandError on timeout
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

#### @eserstack/standards

- `routes.matchPattern`, `matchRoute` and `findMatchingRoute` return params
  percent-decoded, and a catch-all also matches its bare prefix. Pass the
  pathname percent-encoded, as `URL.pathname` gives it, and remove your own
  `decodeURIComponent`, or values with `%` get decoded twice. List a route for
  `/docs` before the catch-all if `/docs` should reach another route:

  ```typescript
  import * as standards from "@eserstack/standards";

  const params = standards.routes.matchRoute(
    "/stories/hello%20world",
    "/stories/[slug]",
  );
  // Before: decodeURIComponent(params.slug); After: params.slug is "hello world"
  standards.routes.matchRoute("/docs", "/docs/[...path]");
  // Before: null; After: { path: [] }
  ```

- `cross-runtime`: `Runtime` has a required `http`, `RuntimeProcess` has
  `addSignalListener` and `removeSignalListener`, and `RuntimeCapabilities` has
  `http: boolean`. A hand-built runtime or mock no longer type-checks. Spread
  the real objects and override what you need, add `http: false` to capability
  literals, or build the mock with `await createRuntime({ ... })`:

  ```typescript
  import * as standards from "@eserstack/standards";

  const { runtime } = standards.crossRuntime;

  // Before: const fakeProcess = { cwd: () => "/tmp", ... };
  const fakeProcess = { ...runtime.process, cwd: () => "/tmp" };
  ```

- Bun: `runtime.exec.spawn` and `spawnChild` add `SpawnOptions.env` to the
  inherited environment instead of replacing it, as Deno and Node do. Pass every
  variable you want overridden; no runtime starts a child with a cleared
  environment.
- Node and Bun: `runtime.process.stdout` and `stderr` attach to the process
  stream on the first write, and `stdin` on the first read, so closing one
  before use no longer ends the process stream. To end a stream, write to it
  first or call the Node API.

#### @eserstack/laroux

- Pages and layouts receive a `request` prop (`PageProps`, `LayoutProps`). Type
  them with the laroux types:

  ```typescript
  import type * as React from "react";
  import type * as laroux from "@eserstack/laroux";

  // Before: export function StoryPage(props: Record<string, unknown>)
  export function StoryPage(props: laroux.PageProps) {/* ... */}
  // Before: export function RootLayout(props: { children: React.ReactNode })
  export function RootLayout(props: laroux.LayoutProps<React.ReactNode>) {
    /* ... */
  }
  ```

- `matchRoute` and `findMatchingRoute` decode params and let a catch-all match
  its bare prefix, as in `@eserstack/standards` above. Remove your own
  `decodeURIComponent` on params.
- `buildPictureSources` takes one options object (`PictureSourcesOptions`):

  ```typescript
  import * as laroux from "@eserstack/laroux";

  // Before
  laroux.buildPictureSources(basePath, ext, ["avif", "webp"], srcSet, sizes);
  // After
  laroux.buildPictureSources({
    ...laroux.parseImageSrc(src),
    formats: ["avif", "webp"],
    srcSet,
    sizes,
  });
  ```

- `buildPlaceholderStyles` writes `backgroundImage` as a quoted, escaped
  `url("...")` instead of `url(...)`. Only code that compares the exact string
  changes.
- `DEFAULT_BROWSER_SHIMS` gives client bundles a real `@eserstack/logging` that
  writes Warning and above to the browser console, instead of a no-op. To keep
  the browser silent, call `config.configure()` with a higher `lowestLevel` in
  client code, or map `@eserstack/logging` to another module in the app's
  `browserShims`.
- The chunk manifest types (`ChunkManifest`, `ComponentChunkInfo`, `FileInfo`)
  live in `@eserstack/laroux` (root and `./chunk-manifest`);
  `@eserstack/laroux-bundler` still re-exports them. Before: `ChunkManifest`
  from laroux-bundler. After: `laroux.ChunkManifest`.

#### @eserstack/laroux-react

- Server action results arrive as an RSC stream (`text/x-component`) instead of
  JSON, and the client bootstrap accepts only that content type. Deploy
  laroux-server and laroux-react from the same release. A newer client with an
  older server fails each call with an error saying to run the same laroux
  version on both sides. Custom code that read JSON from `/_rsc` decodes the
  body instead:

  ```typescript
  import * as larouxClient from "@eserstack/laroux-react/client";

  // Before: const result = await response.json();
  if (response.body !== null) {
    const result = await larouxClient.createValueFromReadableStream(
      response.body,
    );
  }
  ```

- RSC wire format: a string in a J chunk that starts with `$` is sent with a
  second `$`, values JSON cannot hold travel as tags (`$D`, `$n`, `$Q`, `$W`,
  `$undefined`, `$NaN`, `$Infinity`, `$-Infinity`, `$-0`; see
  `protocol.RSC_VALUE_TAGS`), and array children are `"$<id>"` references. A
  custom RSC parser strips the extra `$` and decodes the tags, or uses
  `@eserstack/laroux-react/client`.
- `createFromReadableStream` and `createHybridRSCTree` fail every pending chunk
  when the stream fails or ends without it; its Suspense boundary used to wait
  forever. Render an error boundary above Suspense boundaries that stream data.
- `Link` has no `prefetch` prop; it was accepted and ignored. Before:
  `<Link href="/about" prefetch>`. After: `<Link href="/about">`.
- `Link` runs the app's `onClick` on every click before it decides anything, and
  `event.preventDefault()` there stops its client navigation. An `onClick` that
  assumed a client navigation checks `event.defaultPrevented` or the href.
  Clicks with a `target` other than `_self`, with `download`, or with a
  non-primary button are left to the browser.
- `Link` writes `data-laroux-link` (and `data-laroux-scroll="false"` with
  `scroll={false}`) on its anchor, and the client bootstrap handles clicks on
  them, so a `Link` that a server component renders now navigates on the client
  instead of loading the whole page. Render a plain `<a>` for a full page load.
- `Image` has no `onError` handler and no `data-onerror` attribute; it renders
  the fallback as `data-laroux-fallback`, which laroux's client bootstrap
  applies. An empty `src` with a fallback renders the fallback directly. A React
  app that renders `Image` without laroux's bootstrap adds its own error
  listener that reads `data-laroux-fallback`.
- `ModuleLoader` returns `unknown` instead of `any`. Narrow the result before
  you render it.
- The client bootstrap that laroux-bundler copies into the build imports
  `@eserstack/laroux/navigation`, and laroux-react no longer depends on
  laroux-bundler. Add `@eserstack/laroux` to the app's dependencies.
- Client log records carry their fields as logger properties set with
  `with(...)` instead of an `args` attribute. Custom sinks read
  `record.properties` instead of `record.args`.

#### @eserstack/laroux-bundler

- A `page.tsx`, `layout.tsx`, `route.ts` or `proxy.ts` in or below a directory
  whose name starts with `_` is no longer routed; only `_` file names were
  skipped. Rename `src/app/routes/_private/` to `src/app/routes/private/` if it
  was meant to be public.
- `build()` uses only the adapters you pass. `BuildPlugins` has optional
  `cssProcessor`, `fontOptimizer` and `imageOptimizer` with no-op defaults, and
  `BuildContext` requires them (`createBuildContext` fills them in). CSS modules
  go through the CSS plugin you pass, so without one `@apply` in a CSS module is
  not expanded:

  ```typescript
  import * as fonts from "@eserstack/laroux-bundler/adapters/fonts";
  import * as lightningcss from "@eserstack/laroux-bundler/adapters/lightningcss";
  import * as sharp from "@eserstack/laroux-bundler/adapters/sharp";
  import * as tailwind from "@eserstack/laroux-bundler/adapters/tailwindcss";

  // After: add these to the plugins you pass to build()
  const plugins = {
    css: tailwind.createTailwindPlugin({
      globalCssPath: "src/app/styles/global.css",
    }),
    cssProcessor: lightningcss.lightningCssProcessor,
    fontOptimizer: fonts.googleFontOptimizer,
    imageOptimizer: sharp.sharpImageOptimizer,
  };
  ```

- `scanRoutes(routesDir, projectRoot, forceRescan?)` is
  `scanRoutes(routesDir, projectRoot, { cache? })` and keeps no module-level
  cache. `invalidateRouteCache`, `getGlobalBuildCache` and
  `resetGlobalBuildCache` are removed, and `BuildCache` keys route scans by
  directory (`getRouteScan(routesDir, mtime)`,
  `setRouteScan(routesDir, scan, mtime)`):

  ```typescript
  import * as larouxBundler from "@eserstack/laroux-bundler";

  // Before
  invalidateRouteCache();
  const routes = await scanRoutes(routesDir, projectRoot, true);
  // After
  const cache = new larouxBundler.BuildCache();
  cache.invalidateFile(changedPath);
  const routes = await larouxBundler.scanRoutes(routesDir, projectRoot, {
    cache,
  });
  ```

- `FrameworkPlugin.getClientBundlerPlugins` and `getServerBundlerPlugins` are
  removed; the build never called them. Delete them from custom plugins.
- Client bundles always use rolldown; `bundlerBackend` selects only the server
  bundle's backend. `RuntimeBundler` bundles with rolldown, applies the new
  `browserShims` option (default `DEFAULT_BROWSER_SHIMS`), and resolves from
  `config.projectRoot` instead of the working directory. Pass the real
  `projectRoot`, and `browserShims` to match a custom production setting.
- `BuildConfig.noCssModuleAutoReference`, which was ignored, is honoured: with
  it, the Tailwind plugin adds no `@reference` to CSS modules. Remove the
  setting if you relied on the injection.
- The chunk manifest is `<distDir>/client/manifest.json`, written after every
  other step, so a running or failed build has none. Read
  `dist/client/manifest.json` instead of `dist/manifest.json`.
- `createClientEntry` copies the laroux-react bootstrap to
  `<distDir>/_laroux-react/` with its package layout, and `_client-entry.tsx`
  imports `./_laroux-react/client/bootstrap/entry.tsx`. Code that read
  `<distDir>/entry.tsx` reads the new path.
- `validateBuildIsolation` in strict mode throws `BuildIsolationError` with a
  `violations` field and no longer logs each violation first:

  ```typescript
  import * as larouxBundler from "@eserstack/laroux-bundler";

  try {
    await larouxBundler.validateBuildIsolation(projectRoot, "dist", startedAt, {
      strict: true,
    });
  } catch (error) {
    if (error instanceof larouxBundler.BuildIsolationError) {
      report(error.violations); // After: read the violations here
    }
  }
  ```

- `BuildResult` has a required `buildId: string`. Code that builds a
  `BuildResult` itself, such as a test fake, sets it; `build()` and
  `ensureBuildIsReady()` fill it in.
- `build()` writes `_generated-routes.ts` with page and layout imports that end
  in `?v=<buildId>`. A tool that reads that file as text allows the query;
  `generateRouteFile()` without the new `moduleVersion` option still writes
  plain specifiers.

#### @eserstack/laroux-server

- `startServer` throws `BuildFailedError` when its pre-serve build fails, and
  `laroux build`, `dev` and `serve` exit with code 1; they used to serve a stale
  or empty `dist/`. Fix the build, or catch the error where you must keep
  running:

  ```typescript
  import * as larouxServer from "@eserstack/laroux-server";

  try {
    await larouxServer.startServer(options);
  } catch (error) {
    if (!(error instanceof larouxServer.BuildFailedError)) throw error;
    // After: decide here what a failed build means for your process
  }
  ```

- `startServer` loads the generated routes file, the root layout, the API route
  and proxy registries and the actions manifest before it serves. A module among
  them that fails to load, or a missing root layout, stops startup with that
  error; requests used to fail later. In dev, the same failure after a rebuild
  keeps the previous pages and sends HMR clients an error. Fix the reported
  module, or add `src/app/layout.tsx`.
- `ServerOptions` takes `cssProcessor`, `fontOptimizer` and `imageOptimizer`,
  and the build no longer runs Lightning CSS, Google Fonts self-hosting or sharp
  unless you pass them. The `laroux` CLI passes them; a programmatic caller adds
  them as in the laroux-server README:
  `cssProcessor: lightningcss.lightningCssProcessor`,
  `fontOptimizer: fonts.googleFontOptimizer`,
  `imageOptimizer: sharp.sharpImageOptimizer`.
- `clearRoutesCache` is removed: each server keeps its own route list and
  reloads it after a successful dev rebuild. Delete the calls.
- Page and `route.ts` params arrive percent-decoded, and API routes use the page
  matcher, so a catch-all also matches its prefix (`/docs` and `/api/docs/`).
  Remove `decodeURIComponent` on params, and validate a param before it reaches
  a file path or a query:

  ```typescript
  // Before
  const slug = decodeURIComponent(ctx.params.slug as string);
  // After
  const slug = ctx.params.slug as string;
  ```

- `renderApp` is typed as
  `renderApp(Layout: ComponentType<LayoutProps<ReactNode>>, Page: ComponentType<PageProps>, props?)`,
  and server-component pages and layouts receive `request`. Type them with
  `laroux.PageProps` and `laroux.LayoutProps<React.ReactNode>`.
- Server action calls answer with an RSC stream (`text/x-component`) instead of
  JSON (see `@eserstack/laroux-react` above), and the RSC-Action 404 body is
  `{"error":"Action not found"}` without the id.
- `streamToResponse()` and `renderRSCResponse()` no longer send
  `Access-Control-Allow-Origin: *` or the other CORS headers. Same-origin
  clients need nothing. A deployment that serves the RSC payload to another
  origin adds CORS for that origin, for example with
  `http.middlewares.cors.cors({ origin: ["https://app.example.com"] })`.
- The render fallback holds `SSR_ERROR_MESSAGE` and a correlation id
  (`data-error-id`) instead of `SSR Error: <error.message>`. Look the error up
  in the server log by its `correlationId`.
- The static routes no longer serve `dist/server/`, `dist/_bundle_src/`,
  `dist/_laroux-react/`, `dist/_client-entry.tsx` or
  `dist/transform-manifest.json`, under any letter case. Put files the browser
  must fetch in `public/` or `dist/client/`.
- `invokeAction()` (`./action-registry`, deprecated) rejects with
  `ServerActionError` for an unknown id and for a throwing action, and no longer
  logs. Match `instanceof ServerActionError`, read `error.cause` for the
  action's own error and `error.actionId` for the action, and log in the caller.

#### @eserstack/laroux-runtime

- `LarouxRuntime.start()` and `execute()` reject with `LarouxManifestLoadError`
  (with `searchDir` and `cause`) when a manifest fails to load, instead of the
  raw `@eserstack/config/file` error. Before:
  `error instanceof ConfigParseError`. After:
  `error instanceof larouxRuntime.LarouxManifestLoadError`, or
  `error.cause instanceof ConfigParseError`.

#### @eserstack/app-runtime

- `AppRuntime.awaitAll()` empties the queue before it waits: a rejected
  operation is reported once instead of on every later call, and work queued
  during the wait is kept for the next call. Handle the first rejection.

#### @eserstack/http

- `adapter.fromRequest` limits bodies to 1 MiB by default. A larger body returns
  `results.fail(RequestBodyTooLargeError)` with status 413, and an invalid
  `maxBodyBytes` throws `RangeError`. Raise the limit, or stream `req.body`
  yourself for uploads:

  ```typescript
  import * as http from "@eserstack/http";

  // Before
  const request = await http.adapter.fromRequest(req);
  // After: allow 10 MiB
  const request = await http.adapter.fromRequest(req, {
    maxBodyBytes: 10 * 1024 * 1024,
  });
  ```

#### @eserstack/httpclient

- `request()` and `requestStream()` use `fetch` like the other methods instead
  of switching to the Go client when `@eserstack/ajan` loads. Pass
  `transport: "native"` in `HttpClientConfig` to use the Go client; passing it
  together with `fetchFn` throws `TypeError`.
- `GoHttpClientOptions`: `timeout` is `timeoutMs`, and `retries` is replaced by
  `retryEnabled` and `maxAttempts`; the old fields never reached Go.
  `createGoHttpClient` defaults `timeoutMs` to 30000 and throws `RangeError` for
  a value that is not positive. `GoHttpRequest.timeout` is removed. Before:
  `{ timeout: 5000, retries: 3 }`. After:
  `{ timeoutMs: 5000, retryEnabled: true, maxAttempts: 3 }`.
- `createH3FetchFn()` takes no arguments and `H3FetchOptions` is removed;
  `certHashes` never pinned anything. Pin through the runtime
  (`Deno.createHttpClient` `caCerts`) or WebTransport `serverCertificateHashes`.
- A request whose body is a `ReadableStream` is not retried. Buffer the body
  yourself if you need retries.

#### @eserstack/formats

- `serialize()` with a value that is not an array writes one document instead of
  a one-item list: JSON `{"a":1}\n` instead of `[{"a":1}\n]\n`, and YAML a
  mapping instead of a sequence. Pass an array to get a list:
  `formats.serialize([value], "json")`.
- Pretty JSON arrays match `JSON.stringify(items, null, indent)`, with items
  indented and no blank line before `]`. Through the native library, YAML now
  indents 2 spaces, TOML whole numbers are integers, and `<`, `>` and `&` are no
  longer escaped, as in the TypeScript formats. Update golden files that compare
  exact text.
- Format writers get `_inArray: false` in `writeStart`, `writeItem` and
  `writeEnd` when the value is a whole document, and `streamLayers.writerLayer`
  passes `_inArray: true` and `_isFirst` on every call. A custom format that
  read `_inArray` treats `false` as a whole document.

#### @eserstack/bundler

- The deno-bundler backend names each entry's output `${key}.js` (and the build
  ID entry `build-id.js`), lists every entry in `entrypointManifest`, `main` and
  `client` included, with the entry's own output first, and sets `entrypoint` to
  `${entryName}.js`. Look outputs up by `${key}.js`, as with the Rolldown
  backend, and read the first element of a manifest entry as the entry's own
  file.

#### @eserstack/fp, @eserstack/events, @eserstack/di

- The default exports are removed: every `@eserstack/fp` module, and `events`
  and `di` from their packages. Use namespace imports:

  ```typescript
  // Before
  import curry from "@eserstack/fp/curry";
  import events from "@eserstack/events";
  import di from "@eserstack/di";
  // After
  import * as fp from "@eserstack/fp";
  import * as events from "@eserstack/events";
  import * as di from "@eserstack/di";

  fp.curry(fn);
  events.events;
  di.di;
  ```

#### @eserstack/config

- dotenv `load()`, `configure()` and `parseEnvFromFile()` read values as written
  instead of running `decodeURIComponent` over them, and a lone `%` no longer
  throws. Before: `NAME=hello%20world`. After: `NAME="hello world"`.
- dotenv `load()` takes the environment name from the value of the first set,
  non-empty variable in `envVars` (`ENV`, `APP_ENV`, `DENO_ENV`, `NODE_ENV` by
  default) and honours `options.envVars`. It used to use the variable's name, so
  `ENV=production` loaded `.env.ENV`. Rename such a file after the value:
  `.env.ENV` becomes `.env.production`.

#### @eserstack/cs

- `sync()` no longer writes a console warning for a key the environment lacks,
  and no longer goes through the Go `EserAjanCsSync` path. Pass `onMissingKey`
  to be told:

  ```typescript
  import * as cs from "@eserstack/cs";

  const command = await cs.sync({
    resource: { type: "configmap", name: "app-config" },
    onMissingKey: (key) => console.warn(`${key} is not set; left out`), // After
  });
  ```

#### @eserstack/ajan

- `@eserstack/ajan/wasm` probes files with `Deno.statSync` or
  `process.getBuiltinModule("node:fs")`, as `ffi/resolve.ts` does. On a runtime
  with neither (Node before 22.3, Bun before 1.1, browsers),
  `loadEserAjanWasm()` without `wasmPath` throws "Could not find eser-ajan WASM
  module". Pass `wasmPath`, or use a supported runtime.
- The changes to the native library's exports are listed under Native bridge
  below.

#### Go: pkg/ajan/httpfx

- `httpfx.NewRouter(path string)` is `NewRouter(logger *logfx.Logger)` and
  panics on a nil logger. `Router.GetPath` and `Router.Group` are removed; a
  prefix passed to `NewRouter` was never applied. Write the full path in every
  pattern:

  ```go
  // Before
  router := httpfx.NewRouter("/api")
  router.Route("GET /users", listUsers)
  // After
  router := httpfx.NewRouter(logger)
  router.Route("GET /api/users", listUsers)
  ```

- The router logs a result's error when it writes the result, as
  `httpfx router: request error` (scope `httpfx_router`, the router's logfx
  logger, with pattern, status, error and trace id), at WARN below status 500
  and ERROR from 500. It replaces `request error` (scope `httpfx_results`, the
  slog default logger, always ERROR) and `Failed to encode JSON response`. A
  failed body write is `httpfx router: response body not delivered` instead of
  `Failed to write HTTP response body`. Update log queries and alerts that match
  the old message, scope or level.
- `WithSanitizedError` no longer logs when it is called. Code that calls
  handlers and writes their `Result` itself, outside the router, logs the error:
  `if err := result.Unwrap(); err != nil { logger.ErrorContext(ctx, "request failed", "error", err) }`.
- A `Result` built with `WithSanitizedError`, or from a failed JSON encoding,
  carries the error, so `result.Error()` and `String()` include the internal
  text and `errors.Is(result, err)` matches. Never send `result.Error()` to a
  client; send `result.Body()`.
- `Router.RouteRaw` runs the raw handler as the last step of the middleware
  chain. A middleware that returns a `Result` without calling `Next` now stops
  the raw handler, and code after `Next` runs after it returns. Let the request
  through explicitly in middlewares whose rejection used to be ignored on raw
  routes.
- `profiling.RegisterHTTPRoutes` returns an error and reads the token from
  `httpfx.Config.ProfilingToken` (conf key `profiling_token`) instead of
  `PPROF_TOKEN`; `?token=` is no longer accepted. With profiling on and no
  token, nothing is mounted and `ErrProfilingTokenNotSet` is returned:

  ```go
  // Before: PPROF_TOKEN in the environment
  profiling.RegisterHTTPRoutes(router, config)
  // After: config.ProfilingToken loaded from profiling_token
  if err := profiling.RegisterHTTPRoutes(router, config); err != nil {
  	return err
  }
  // Clients send: Authorization: Bearer your_profiling_token
  ```

- `HTTPService.Start` falls back to a standard listener only when socket options
  cannot be set, and its listen error reads
  `HTTP service net listen error on "<addr>": ...`
  (`errors.Is(err, ErrHTTPServiceNetListenError)` still matches). `HTTP3Service`
  closes every connection at shutdown instead of draining in-flight requests.
  Match errors with `errors.Is`, not the text.
- `Config.SkipAuthPaths` now defaults to `/health,/metrics,/docs,/openapi.json`
  (see configfx below). Set `skip_auth_paths` explicitly, an empty value for an
  empty list, if a service must not skip auth on those paths.

#### Go: pkg/ajan/httpfx/middlewares

- `AuthMiddleware(jwtSecret)` is
  `AuthMiddleware(logger, jwtSecret, options...)`. It requires an `exp` claim,
  accepts only HS256 by default, rejects every request when the secret is empty,
  and answers 401 with `Invalid token` or `Token is expired` instead of
  `Invalid or expired token`:

  ```go
  // Before
  router.Use(middlewares.AuthMiddleware(cfg.JWTSecret))
  // After
  router.Use(middlewares.AuthMiddleware(
  	logger,
  	cfg.JWTSecret,
  	middlewares.WithAuthIssuer(cfg.AuthIssuer),
  	middlewares.WithAuthAudience(cfg.AuthAudience),
  	middlewares.WithAuthSigningMethod(jwt.SigningMethodHS512), // only for HS512 tokens
  ))
  ```

- `ResolveAddressMiddleware(options...)` is
  `ResolveAddressMiddleware(logger, options...)`, and its 500 body is
  `Internal Server Error` instead of the error text. Pass the service's logger
  first.
- `SecurityHeadersMiddleware` sends HSTS only on TLS requests, or when a proxy
  listed through `WithSecurityHeadersTrustedProxies` sends
  `X-Forwarded-Proto: https`. It adds
  `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy`
  that turns off camera, microphone, geolocation, display-capture, payment, usb
  and motion sensors. Pass `WithSecurityHeadersTrustedProxies(proxies)` behind a
  TLS proxy, and `WithPermissionsPolicy(...)` or `WithReferrerPolicy(...)` to
  change the policies (an empty string omits the header).
- `RateLimitMiddleware` changes:
  - loopback keys (127.0.0.1, ::1, localhost) are no longer exempt; local
    benchmarks pass `WithRateLimiterSkipLoopback()`;
  - the default key and `WithRateLimiterIPKeyFunc` group IPv6 clients by their
    /64 prefix, and an IPv4 address mapped into IPv6 counts as its IPv4 form;
    pass `WithRateLimiterIPv6Prefix(128)` to count each IPv6 address on its own;
  - a handler holds at most 100,000 keys, evicting expired windows first, then
    the oldest key, whose count restarts; pass `WithRateLimiterMaxKeys(n)` for
    another bound;
  - it panics at construction when `WithRateLimiterWindowSize` is not positive,
    `WithRateLimiterMaxKeys` is below 1, or `WithRateLimiterIPv6Prefix` is
    outside 1 to 128.

  ```go
  // After: the 4.x counting, one key per IPv6 address
  router.Use(middlewares.RateLimitMiddleware(
  	middlewares.WithRateLimiterIPv6Prefix(128),
  ))
  ```

- `PinAuthMiddleware` ignores `?token=` except on a WebTransport extended
  CONNECT on a `RouteRaw` route, and its 401 on raw routes is the plain-text
  body `unauthorized` instead of `{"error":"unauthorized"}`. REST clients send
  `Authorization: Bearer your_token`.

#### Go: pkg/ajan/noskillsserverfx and noskills-server

- `WorkerHandle` methods take a context first: `PushMessage`,
  `PermissionResponse`, `SendMux`, `SetMode` and `StopTask`. A mux worker write
  gives up after 5 s or at the context's deadline. Implementations add the
  parameter, and callers pass their request context:

  ```go
  // Before
  err := worker.SetMode("plan")
  // After
  err := worker.SetMode(ctx, "plan")
  ```

- `PushDispatcher.MaybeTrigger(entry, evt)` is `MaybeTrigger(ctx, entry, evt)`.
- `CheckForUpdateAsync()` is removed. Run
  `CheckForUpdate(ctx context.Context, out io.Writer) error` in your own
  goroutine; its errors wrap `ErrUpdateCheck`:

  ```go
  process.StartGoroutine("update-check", func(ctx context.Context) error {
  	if err := noskillsserverfx.CheckForUpdate(ctx, os.Stdout); err != nil && ctx.Err() == nil {
  		logger.WarnContext(ctx, "update check failed", "err", err)
  	}
  	return nil
  })
  ```

- Sessions exist only between `Server.Start` and shutdown:
  `SessionManager.GetOrCreate` fails before `Start` and once shutdown has begun.
  Start the server before attaching.
- A WebTransport attach refused for its `Origin` answers 403 instead of 400.
  Clients that matched on 400 also handle 403.
- Every `/attach` write has a 30 s deadline. A client that does not take a write
  in time is disconnected with WebTransport close code 1 and the reason
  `client stopped reading`; clients reconnect with `?after=<last seq>` as after
  any disconnect.
- A malformed `push/subscriptions.json`, or an unreadable or incomplete
  `push/vapid.json`, disables push with a startup warning instead of being
  reset. Fix the JSON or remove the file; removing `vapid.json` makes every
  browser subscribe again.
- `noskills-server start` exits with status 1 when the daemon cannot start (port
  in use, TLS setup failure) instead of waiting for a signal, and no longer asks
  the timing question or reads `telemetry.json`, which you can delete.

#### Go: pkg/ajan/noskillsfx

- `BuildBehavioral(state, maxIterations, allowGit, concerns, hints)` is
  `BuildBehavioral(state, allowGit, activeConcerns, hints, commandPrefix)`, and
  `BehavioralBlock.Urgency` is removed; `Compile` sets
  `NextOutput.RestartRecommended` instead:

  ```go
  // Before
  block := noskillsfx.BuildBehavioral(state, 15, allowGit, concerns, hints)
  // After: an empty prefix falls back to noskillsfx.DefaultCommandPrefix
  block := noskillsfx.BuildBehavioral(state, allowGit, concerns, hints, manifest.Command)
  ```

- `NextOutput.CurrentQuestion` and `DiscoveryOutput.CurrentQuestion` are
  removed. In DISCOVERY, `Compile` returns the unanswered base questions with
  the ask-together instruction and the JSON template in `OnComplete`, then the
  pending follow-ups one at a time in the new `PendingFollowUps` field. Read
  `Questions` instead of the index.
- `ConcernDefinition.Reminders` is `[]ConcernReminder{Text, Scope}` instead of
  `[]string`. Read `.Text` and `.Scope`; concern JSON with plain strings still
  loads. `LoadConcerns` returns an error wrapping `ErrInvalidScope` for an
  unknown or malformed scope, or `ErrInvalidReminder` for a reminder object
  without text.
- `SplitRemindersByTier(concerns)` takes the classification:
  `SplitRemindersByTier(concerns, state.Classification)` (nil when there is
  none). `Compile` in EXECUTING puts only unscoped reminders in
  `Context.ConcernReminders` and sets `Behavioral.Tier2Summary`, as the
  TypeScript compiler does; it used to include scoped reminders that matched the
  classification. The FFI `nextNoskillsStep` and noskills-server return this
  output.
- `WriteManifest` writes the noskills keys under a `noskills:` section of
  `.eser/manifest.yml`, the layout the TypeScript CLI uses. `ReadManifest` reads
  the section and falls back to the old top-level keys. Code that reads the file
  directly reads `noskills:` instead of the top level.

#### Go: pkg/ajan/acpfx, pkg/ajan/webtransport and pkg/ajan/api

- acpfx: `Client.Close` also closes every `Session` it opened. The claude-code
  shim ends a turn whose CLI result has `stop_reason` `refusal` with
  `stopReason` `refusal` instead of `end_turn`; ACP clients handle `refusal`,
  which the ACP spec defines.
- webtransport: `NewClient(opts...)` returns `(*Client, error)`, `Option` is
  `func(*Client) error`, `WithMaxIdleStreams` and `Config.MaxIdleStreams` are
  removed, and an invalid option (a negative `DialTimeout`, a cert hash that is
  not 32 bytes, TLS `MaxVersion` below 1.3) returns an error wrapping
  `ErrInvalidOption`. `Client.Close` ends in-flight dials, and later `Connect`
  calls return `ErrClientClosed`. Dial errors name only `scheme://host/path`:

  ```go
  // Before
  client := webtransport.NewClient(webtransport.WithMaxIdleStreams(8))
  // After
  client, err := webtransport.NewClient()
  if err != nil {
  	return err
  }
  ```

- api/adapters/appcontext registers its info route as `GET /{$}`: only `/`
  answers 200 with `<app> is running`, and any other unknown path gets 404.
  `New` returns the listen error when the HTTP server cannot listen. Point
  health probes at `/` or the healthcheck module's route, and register an
  explicit route for every path the service serves.

#### Go: pkg/ajan/aifx

- Anthropic thinking blocks arrive as `ContentBlockThinking` with
  `ContentBlock.Thinking` (`Text`, `Signature`, `RedactedData`) instead of
  `ContentBlockText`, so `GenerateTextResult.Text()` no longer includes
  reasoning. `StreamEventThinking` is a new stream event type. Read reasoning
  from blocks with `Type == ContentBlockThinking`, and handle or ignore
  `StreamEventThinking` in custom stream consumers.
- Stop reasons follow the TypeScript changes in `@eserstack/ai` above: refusals
  from every provider and ACP are `StopReasonRefusal`, Gemini and Vertex AI tool
  calls end with tool use, and a missing OpenAI `finish_reason` is `end_turn`.
  Check `StopReasonRefusal` before you use the text.
- `GenerateTextOptions` has an `Effort` field, so unkeyed struct literals no
  longer compile. Use keyed fields, and leave `Effort` unset to keep the old
  behavior.
- A `json_schema` `ResponseFormat` with a missing, null or non-object schema
  fails before sending with an error wrapping `ErrBadRequest` and
  `ErrInvalidResponseSchema`. Anthropic sends the schema as
  `output_config.format`, so a schema outside Claude's subset gets a 400. Gemini
  and Vertex AI `json_object` sends only the JSON MIME type and ignores
  `JSONSchema`. Set `JSONSchema` to a JSON Schema object, and use `json_schema`
  when the reply must follow it.
- A `ToolDefinition` whose `Parameters` are not valid JSON fails the request
  with `ErrBadRequest` on anthropic, gemini and vertexai, instead of sending the
  tool without a schema.
- `ACPModel.GetCapabilities` no longer declares `tool_calling` for the kiro and
  opencode backends, and claude-code declares `tool_calling` and
  `structured_output`; Anthropic models declare `structured_output` and
  `reasoning`. `GetByCapability(tool_calling)` returns no kiro or opencode ACP
  model; use claude-code or an API provider for tool calls.
- `ParseJsonlStream` emits an error event on a read failure, including a line
  over 1 MiB, instead of ending silently. A non-streaming Ollama response over
  16 MiB and an OpenAI batch output file over 512 MiB fail with an error
  wrapping `lib.ErrReadLimitExceeded`. Use `StreamText` for very long Ollama
  replies, and split such batches.

#### Go: pkg/ajan/kitfx, workflowfx and postsfx

- kitfx: `FetchRegistry`, `FetchRegistryFromRepo`, `FetchRecipeFile`,
  `FetchRecipeFolder`, `ApplyRecipe`, `ApplyRecipeChain` and
  `InstallDependencies` take a context first:

  ```go
  // Before
  result, err := kitfx.ApplyRecipe(recipe, opts)
  // After
  result, err := kitfx.ApplyRecipe(ctx, recipe, opts)
  ```

- kitfx: registry and GitHub requests time out after 30 s, and a response body
  over 4 MiB is an error wrapping `lib.ErrReadLimitExceeded`. Each install or
  post-install command stops after 10 minutes (`DefaultCommandTimeout`) or when
  the context ends, and a negative `ApplyOptions.PostInstallTimeout` is an
  error. Set `PostInstallTimeout` to a longer positive duration for a recipe
  that needs more time.
- workflowfx `http-fetch` fails a step whose response body is over 10 MiB;
  download large files with the shell tool. The postsfx X and Bluesky clients
  fail on an API response over 8 MiB.

#### Go: pkg/ajan/configfx

- `Load` returns errors instead of panicking or skipping: a conf-tagged field it
  cannot set (unexported, or behind a nil embedded struct pointer) wraps
  `ErrUnsettableConfigField`; a target that is not a non-nil pointer, or a map
  whose struct value embeds a non-struct type, returns `ErrNotStruct`; a field
  type it cannot parse (`complex128`, `[][]int`, interfaces with methods), or a
  map with non-string keys, returns `ErrUnsupportedConfigType`. Export the field
  or remove its `conf` tag, allocate embedded struct pointers before `Load`, and
  change unsupported field types.
- Slice fields load their `default` tag and a comma-separated value at their
  key, and the value at the key wins over indexed keys (`PATHS__0`). An index at
  or above `MaxIndexedSliceLength` (10000) returns `ErrInvalidConfigValue`. Use
  indices 0 to 9999.
- Map values of every supported type are parsed (`map[string]any` gets the
  string, where it got nil, and `map[string]int` its numbers), and structs that
  implement `encoding.TextUnmarshaler`, such as `time.Time`, load from one
  value. Pointer fields such as `Port *int` are set from a source or a default,
  and a pointer to a struct section is allocated when a key under it is set.
  Code that relied on them staying nil checks the loaded value.
- jsonparser keeps the written text of JSON numbers, so `1e3` or `10.0` no
  longer loads into an int field; write integers without a fraction or exponent.
  `null` removes the key and its children so the default applies (it used to set
  the string `<nil>`), and an empty array clears a slice default.

#### Go: pkg/ajan/logfx, processfx, types and i18nfx

- logfx: subscribers registered with `Handler.AddSubscriber`, including the OTLP
  export, get the attributes of `WithAttrs` and `WithGroup` flattened to dotted
  keys, and pretty and subscriber records under an open group carry `trace_id`
  and `span_id` under the group prefix. Before: `trace_id`. After:
  `http.trace_id` on a logger grouped as `http`.
- processfx: `Process.Wait` no longer closes `Process.Signal`. Select on
  `p.Ctx.Done()` instead of waiting for the channel to close, and do not close
  `p.Signal` yourself; that only stops signal handling.
- types: `MetricInt` `UnmarshalText` and `UnmarshalJSON` return an error
  wrapping `ErrMetricIntOutOfRange` for values outside int64, NaN and Inf.
- i18nfx: `IsRTL` and `Dir` use the script of the BCP 47 tag, so `he`, `fa`,
  `ur`, `ar-EG`, `dv` and `az-Arab` are right-to-left (only `ar` was).
  `Localizer.T` and `TWithData` return the default locale's text for a message
  the requested locale lacks, instead of the message ID. `NewLocalizer` error
  prefixes are `parse`, `read` and `load` instead of `parsing`, `reading` and
  `loading`; match with `errors.Is`.

#### Go: pkg/ajan/formatfx and csfx

- JSON layout: `WriteStart` with `Pretty` returns `[` instead of `[\n`, list
  entries from `WriteItem` no longer end with `\n`, and pretty entries start
  with `\n` and are indented one level, so `WriteStart` + `WriteItem`... +
  `WriteEnd` gives the `JSON.stringify` layout. A nil `*FormatOptions` is a list
  entry that is not first, so it gets a leading `,`. Write one value as a
  document with `Document: true`:

  ```go
  // Before: a nil options value wrote the value and a newline
  out, err := format.WriteItem(value, nil)
  // After
  out, err := format.WriteItem(value, &formatfx.FormatOptions{Document: true})
  ```

- YAML `WriteItem` applies `FormatOptions.Indent`, 2 spaces by default instead
  of 4; pass `Indent: 4` to keep the old width. TOML writes whole-number float64
  values within ±2^53 as integers, so a reader gets int64, and no longer indents
  nested tables. JSON and JSONL no longer escape `<`, `>` and `&`. With
  `Document: true`, YAML writes the value itself and TOML adds no `+++` line.
- `csfx.Generate` (`eser cs generate`) writes JSON as `[\n  {...}\n]\n` instead
  of `[\n{...}\n\n]\n`, and YAML with 2-space indentation. Update golden files
  that compare exact text.

#### Go: pkg/ajan/codebasefx

- `DiscoverWorkspacePackages` returns an error wrapping `ErrNoWorkspaceMembers`
  instead of `nil, nil` when there are no members, and fails on a malformed
  member config. Declare members in the root `package.json` `workspaces`, or
  treat the sentinel as nothing to check:

  ```go
  packages, err := codebasefx.DiscoverWorkspacePackages(root)
  if errors.Is(err, codebasefx.ErrNoWorkspaceMembers) {
  	return nil // After: no members means nothing to check
  }
  ```

- `CheckModExports` (`validate-mod-exports`) reports root modules that no entry
  point reaches, instead of requiring `mod.ts` to re-export every root file, and
  `validate-package-configs` compares dependencies only when `deno.json`
  declares an imports map.
- `RunValidators` fails every validator for a file that exists but cannot be
  read, instead of validating it as empty. The registry tools return an error
  from `Run` for malformed `rules` (codebase-filenames) or a `maxKb` that is not
  a whole non-negative number (codebase-large-file, `RunSingleValidator`),
  instead of using defaults. Make the file readable or exclude it, and fix the
  option.

#### Native bridge (github.com/eser/ajan, @eserstack/ajan)

- `EserAjanShellExec` (and command-mode WASM `shellExec`) stops a command after
  10 minutes when the request has no `timeout`, and rejects a zero or negative
  `timeout` before the command starts. Before: `{"timeout": "0s"}` meant no
  limit. After: omit `timeout` for the default, or send a positive Go duration
  such as `"30m"`.
- `EserAjanHttpRequest` returns the status and headers with an error and no body
  for a response over 32 MiB, and `EserAjanHttpRequestStream` reads error-status
  bodies under the same limit. Send `maxResponseBytes` in the request JSON, or
  use the stream variant.
- `EserAjanCodebaseValidateFiles` and its stream variant fail the request for
  malformed `validatorOptions` of `filenames` or `large-file`, and `large-file`
  applies `maxKb`; it was always 1024 KB.
- `EserAjanNoskillsInit` writes `command: npx eser@latest noskills`
  (`noskillsfx.DefaultCommandPrefix`) into a new manifest instead of `noskills`.
  Edit the manifest's `command` to keep a bare `noskills`.

#### Recipes

- `eser kit new library-pkg` produces a workspace package: a `package.json` with
  `"@eserstack/primitives": "workspace:*"`, no `deno.json`, the name
  `@eserstack/package-name`, and a `greet` that returns
  `primitives.results.Result<string, Error>`. Outside the eser/stack workspace,
  replace `workspace:*` with `npm:@jsr/eserstack__primitives@^4.5.2` and add an
  `.npmrc` with `@jsr:registry=https://npm.jsr.io`. Callers check the result:

  ```typescript
  // Before
  const message = greet("Ada");
  // After
  const result = greet("Ada");
  if (primitives.results.isOk(result)) console.log(result.value);
  ```

- The `cool-lime-app` recipe is renamed `laroux-runtime-app`; run
  `eser kit new laroux-runtime-app`. Its `pkg/app/mod.tsx` exports `appModule`
  and `sum` instead of `limeModule` and `anyFnc`. Projects already generated
  keep their files.

#### Repository development tooling

- The REPL (`deno task cli repl`) no longer puts package namespaces in separate
  globals. Before: `fp.curry(...)`. After: `eserstack.fp.curry(...)`. `vars()`
  lists the globals again.

## 4.5.2 - 2026-09-17

### Fixed

- **codebase**: align Go secrets validator with TypeScript and speed it up
  (88bd8be)
- **ajan**: pin platform packages to the exact CLI version and publish them
  first (01063c9)

### Changed

- make the platform packages workspace members linked with workspaces (0c089fb)
- **deps**: update all npm and Go dependencies to latest (0af9b58)
- **build**: run the Node and Bun cross-runtime checks from a packed install
  (fa912d7)
- **release**: let post-gate jobs run on a post-publish resume (2511184)
- **release**: make the release chain resumable and prove it on main before
  tagging (0810882)

## 4.5.1 - 2026-09-13

### Fixed

- **codebase**: surface gh stderr on release failures, skip published npm
  (869c90c)

## 4.5.0 - 2026-09-12

### Changed

- **go**: pin toolchain, tidy ajan deps and check go.mod drift in make (7e24ef7)

## 4.4.0 - 2026-09-12

### Fixed

- **ajan**: harden FFI bridge, config parsing and HTTP security (b2f019c)

### Changed

- **go**: pin CI Go to go.mod and bump golangci-lint to v2.13.2 (fd3e4d2)

## 4.3.1 - 2026-08-09

### Fixed

- **security**: pin on resumed sessions, compare DataDir by identity (c06b36c)
- **security**: harden path, TLS pinning, and regex guards (b4ffb79)

### Changed

- **deps**: bump the actions group with 3 updates (#155) (d78ce57)
- **deps**: bump the npm-deps group with 2 updates (#154) (52a8645)
- **deps**: bump the go-deps group with 15 updates (#153) (4a03973)

## 4.3.0 - 2026-08-08

### Fixed

- **build**: mark FFI packages external in all npm builds (1e3ddb3)
- **codebase**: stage only tracked pathspecs during release (20b5c71)
- **codebase**: report correct target version in dry-run release (77cdebf)

### Changed

- docs structure. (35889e5)
- **cli**: make system handlers app-aware, share PATH lookup (168a99f)
- **cli**: ship noskills and laroux as deno-compiled binaries (c58e6bc)

## Notes Released with 4.3.0

### Added

- **codebase:** `validate-server-loc` — generic per-directory LOC ceiling
  validator. Configurable via `directory` (required), `maxLines`,
  `excludeSuffix`, `extension`. Replaces `scripts/noskills-server-loc-check.ts`;
  now wired into precommit on `pkg/ajan/noskillsserverfx`.
- **codebase:** `validate-error-coverage` — generic error-struct field-coverage
  validator. Configurable via `file` (required), `errorObjects`,
  `requiredFields`. Replaces `scripts/noskills-error-coverage.ts`; now wired
  into precommit on `pkg/ajan/noskillsserverfx/errors.go`.

- **kit:** `kit clone` whole-repo mode — repos without `recipe.json` (or with an
  empty one) now copy the entire tree via tarball fetch instead of failing.
- **kit:** `--interactive`/`-i` flag and TTY auto-detect — prompts for missing
  variables when stdin is a terminal, with regex retry on `pattern`.
- **kit:** `--no-post-install` flag — skips post-install commands.
- **kit:** GitHub subpath specifier `gh:owner/repo/sub/path[#ref]`.
- **kit:** stub providers for `npm:` and `jsr:` — parse accepted, `fetch` throws
  "not yet implemented" with a tracking URL.
- **kit:** "Variables applied:" pretty-print to stderr before writing files.
- **kit:** positional target dir — `eser kit clone <specifier> [target-dir]`.
- **kit:** binary file detection in whole-repo mode (33-extension blocklist) to
  avoid mangling PNGs, ZIPs, fonts, etc.
- **kit:** `{{.var}}` substitution now applies to file and directory **names**
  in addition to file contents.

### Changed

- **kit:** `Recipe` schema fields `name`, `description`, `language`, `scale`,
  `files` are now optional in standalone `recipe.json` (lenient clone path).
  Registry entries still require them via `isRegistryRecipe`.
- **build:** the Go shared library is built with `-ldflags=-s -w`, dropping the
  symbol table and DWARF: 40.9 MB → 34.7 MB, measured on darwin/arm64. It is
  copied into every archive that needs FFI, so the saving is paid per binary per
  platform. Nothing consumed the symbols — the library is loaded through a C
  ABI, and Go panics still print stacks from runtime tables.
- **standards:** `formatNumber` no longer uses `toLocaleString`. Its documented
  contract is `"1,000,000"` — a fixed format, not a localised one — so a
  locale-dependent implementation was already wrong, and it returns the
  unseparated string entirely under `deno compile --engine quickjs`, which has
  no Intl. Its test asserted `.includes("1")` and `.includes("000")`, both true
  of `"1000000"`, so it could not observe the behaviour it was named for; it now
  asserts the exact string.
- **cli:** `noskills` and `laroux` ship as standalone binaries again, but are no
  longer separate implementations. `cmd/noskills` was 1,563 lines of Go covering
  a subset of the same commands as `eser noskills` — a fork of the behaviour,
  free to drift, and it had. Both binaries are now `deno compile` entry points
  that mount the SAME module object the `eser` CLI mounts, re-rooted, so
  `noskills next` and `eser noskills next` are one code path with nothing to
  keep in sync. `brew install noskills` and `brew install eser` both work; the
  tap gets a formula per binary.

  `compile.ts` grew a `BINARIES` list and the homebrew updater a matching
  `FORMULAS` list — adding a binary is an entry in each, never an
  implementation. GoReleaser is gone entirely: `compile.ts` cross-builds
  `noskills-server` alongside the deno-compiled binaries, so one pipeline
  releases the whole family at one version into one `SHA256SUMS.txt`.
- **acp:** the `eser-acp` binary is gone. `pkg/ajan/acpfx/shim` is Go code
  linked into the same binary as its callers, so reaching it through a
  subprocess meant `aifx` and `noskillsserverfx` serialising JSON down a pipe to
  a struct they already had in memory — and paying for a second executable to be
  built, shipped, installed, put on PATH, probed for, and explained when absent.
  `acpfx.InProcess` links the two over an in-memory pipe instead; the protocol,
  handshake and capability negotiation are unchanged. `acpfx.Spawn` remains for
  agents that genuinely are other programs (`gemini --acp`, `claude-agent-acp`),
  selectable with `NOSKILLS_ACP_COMMAND`.

  Removed with it: the goreleaser build and brew install line, `ShimCommand` and
  `ShimMissingHint`, the `shimIsAvailable()` PATH probe and ACP provider gating
  in `ajan-bridge.ts`, the shim half of both installers, and the `eser-acp`
  steps in the Windows CI job. **`binPath` on an ACP provider now names the
  vendor CLI** (claude, kiro, opencode) rather than the shim.

  The rewritten tests also corrected a claim the old ones only appeared to
  prove: tool-call surfacing was asserted against the `opencode` backend, but
  passed only because the fake replaced the whole shim. `mapOpenCodeEvent`
  classifies text, done and error and has no tool-call path, so opencode cannot
  surface one. That test now runs against `claude-code`, which does.
- **repo:** the top-level `scripts/` directory is gone; its files moved into
  `etc/scripts/`, which already held the repo's tooling. The installers
  collapsed into **one** `etc/scripts/install.sh` that takes the product as an
  argument (`| sh -s noskills-server`), with `install.ps1` as its Windows
  counterpart (`-Product`). **The public install URL changed** —
  `main/scripts/install.sh` is now `main/etc/scripts/install.sh`. The old URL
  never completed a successful install, so no working setup breaks.
- **codebase:** `WalkSourceFiles` now enumerates untracked-but-not-ignored files
  via `git ls-files --others --exclude-standard`. It previously listed only
  files already in the index, so every validator built on it — runtime-API
  portability, licence headers, filenames, secrets — silently skipped files that
  had been created but never committed. New code is the code most likely to be
  wrong, and it was the only code exempt. The function's own doc comment had
  always claimed untracked files were included.
- **standards:** `FileInfo.mode` and `RuntimeProcess.isAlive(pid)` added to the
  cross-runtime surface. Both existed only as runtime-specific globals before,
  which meant callers either reached for `Deno.*` (breaking under Node) or could
  not express the check at all.
- **ai:** the `claude-code` adapter honours `properties.cwd`, and omits
  `--model` when the configured model is empty. It previously ignored cwd — so
  the same config rooted the agent at the project on the ACP path and at the
  caller's directory on the TypeScript one — and pushed a dangling `--model`
  flag that the CLI rejects.
- **noskills:** `noskills run` drives each iteration through the ai package's
  `claude-code` provider instead of a raw `claude -p` shell-out, and records the
  iteration itself. Previously it discarded the agent's output entirely and
  learned what happened only by re-reading `state.json`, which Claude Code's
  Stop hook was expected to have written — with nothing verifying that it had.
  If the hook was absent or misconfigured, state never moved, the same prompt
  was rebuilt and re-sent, and the loop burned every one of `--max-iterations`
  before reporting "Max iterations reached" rather than the real fault. The loop
  now also surfaces the turn's `stopReason`, so `end_turn`, `max_tokens`,
  `refusal` and `cancelled` are no longer indistinguishable. `execution.driver`
  marks which writer owns the turn so the Stop hook stands down while the loop
  is driving; the two used to be capable of racing read-modify-writes on one
  file. Iteration recording is now a single shared implementation
  (`state/iteration.ts`) with both callers routed through it. Provider selection
  is unchanged in effect where `eser-acp` is absent: the pure-TypeScript adapter
  runs the same vendor binary in the same mode.
- **ai:** `ai ask` default models refreshed across every provider whose default
  had gone stale: `anthropic` and `claude-code` to `claude-sonnet-5` (from the
  dated snapshot `claude-sonnet-4-20250514`), `openai` to `gpt-5.6-terra` (from
  `gpt-4o`, whose `2024-05-13` snapshot has an announced shutdown), and `gemini`
  and `vertexai` to `gemini-3.6-flash` (from `gemini-2.0-flash`, already past
  its shutdown date — Google names 3.6 Flash as its replacement). Two rules now
  govern the table: aliased IDs rather than dated snapshots, so a default tracks
  its tier instead of freezing on the day it was typed; and the balanced tier
  rather than the flagship, since this is what a bare `ai ask` gets. Pass
  `--model` or set `ConfigTarget.Model` for a flagship or a pinned snapshot.
  Note Gemini 3.6 Flash silently ignores `temperature`/`topP`; the Google
  adapters send only those two, so no request breaks, but they have no effect.
- **ajan:** the six `@eserstack/ajan-*` platform `optionalDependencies` (and the
  generated `@eserstack/ajan` dependency of the published CLI) widened to admit
  `^5.0.0` alongside their existing floor. Resolution is unchanged today — no
  resolved version in `pnpm-lock.yaml` moved — but the ranges no longer have to
  be edited during the v5.0.0 bump, which is the step whose omission would be
  silent: an `optionalDependency` matching nothing is dropped by pnpm rather
  than erroring, leaving a stale native binary against a new ABI.
  `codebase/ajan-ranges.test.ts` now enforces that every declared range admits
  the root `VERSION`.

### Removed

- **codebase:** `eser codebase scaffolding` command — use
  `eser kit clone <specifier>` instead.
- **codebase:** `eser codebase init` alias for scaffolding — removed without
  shim; use `eser kit clone`.
- **codebase:** `@eserstack/codebase/scaffolding` JSR export — replaced by
  `@eserstack/kit/recipes`.
- **noskills-client:** `DeltaEvent`, `ToolStartEvent` and `ToolResultEvent`
  removed from the `DaemonEvent` union. **Breaking.** Nothing has ever emitted
  them — the daemon's only translation point (`noskillsserverfx/fanout.go`) has
  no case for `delta`, `tool_start` or `tool_result`, and neither worker sends
  them. A client narrowing on those variants was matching on dead branches.
  Assistant text and tool calls arrive inside `SdkEvent` (`sdk_event`), which
  the same release adds to the union for the first time.

### Migration

- `eser codebase scaffolding gh:owner/repo` → `eser kit clone gh:owner/repo`
- `eser codebase init` → `eser kit clone <specifier>`
- `--var key=value` and `--interactive` work identically
- `--skip-post-install` is now `--no-post-install`
- YAML `.eser/manifest.yml` is no longer read; use `recipe.json` (`variables`,
  `postInstall`, `ignore`) instead

- **noskills:** AskUserQuestion confirmation tokens — mechanical enforcement
  that agents asked the user before submitting discovery answers. Per-question
  STATED/INFERRED marking via PostToolUse hook
  (`noskills invoke-hook post-ask-user-question`) and next.ts validation.
- **noskills:** merged listen-first + mode selection entry menu with recursive
  context-sharing.
- **noskills:** automatic spec classification from discovery text, with
  REFINEMENT confirmation.
- **noskills:** userContext migration from `string` → `readonly string[]` with
  backward-compat shim in persistence.normalizeStateShape.

### Changed

- **noskills:** behavioral platforms (Cursor, Windsurf, Copilot) now default
  discovery answers to INFERRED since they lack PostToolUse hook support.
  REFINEMENT will surface all answers for confirmation on these platforms.

## 4.1.56 - 2026-04-06

### Changed

- **ajan:** lazy-load FFI backends with async open
- **noskills:** rename REVIEW→REFINEMENT, DRAFT→PROPOSAL phases
- **noskills:** update phase names, add Jidoka enforcement and review dimensions

## 4.1.55 - 2026-04-05

### Added

- **noskills,codebase:** add Jidoka enforcement, review dimensions, ajan version
  sync

## 4.1.54 - 2026-04-04

### Added

- **noskills,shell:** add learnings, diagrams, follow-ups, xterm vterm
- **shell,noskills:** add TUI widget system and spec delegation workflow

### Fixed

- **ajan,cli:** use .wasm.bin variant to bypass deno compile wasm validation

## 4.1.53 - 2026-04-04

### Added

- **noskills,shell:** add learnings, diagrams, follow-ups, xterm vterm
- **shell,noskills:** add TUI widget system and spec delegation workflow

## 4.1.52 - 2026-04-02

### Fixed

- **noskills-web:** sanitize error responses and add missing dependency

## 4.1.51 - 2026-04-02

### Added

- **noskills:** add web dashboard, event system, and TUI tab bar
- **noskills:** add project root discovery and two-tier rule delivery
- **noskills:** add multi-user identity, discovery modes, and plan-based specs

### Changed

- **noskills:** remove FREE phase, make IDLE default permissive state and
  auto-generate spec slugs

### Fixed

- **codebase:** validate all path parts upfront and fix nested object traversal
  in setPropertyByPath
- **ai:** pipe prompts via stdin to avoid E2BIG on large inputs
- **shell:** suppress pty tcgetattr noise and skip type-check on compile

## 4.1.50 - 2026-04-02

### Added

- **noskills:** add multi-user identity, discovery modes, and plan-based specs

### Changed

- **noskills:** remove FREE phase, make IDLE default permissive state and
  auto-generate spec slugs

### Fixed

- **codebase:** validate all path parts upfront and fix nested object traversal
  in setPropertyByPath
- **ai:** pipe prompts via stdin to avoid E2BIG on large inputs
- **shell:** suppress pty tcgetattr noise and skip type-check on compile

## 4.1.49 - 2026-04-01

### Added

- **noskills:** add multi-user identity, discovery modes, and plan-based specs
- **noskills:** add pack management system and consolidate ajan build targets

## 4.1.48 - 2026-04-01

### Added

- **noskills:** add pack management system and consolidate ajan build targets

## 4.1.47 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

### Fixed

- ***:** broaden Go version regex, use relative imports, and normalize YAML
  formatting
- ***:** harden regex patterns against ReDoS and patch prototype pollution
- **ajan:** update error messages to recommend package install over local build

## 4.1.46 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

### Fixed

- ***:** harden regex patterns against ReDoS and patch prototype pollution
- **ajan:** update error messages to recommend package install over local build

## 4.1.45 - 2026-04-01

### Added

- **ajan,noskills,shell:** add ajan Go bridge, noskills manager, and shell TUI
  primitives

### Changed

- **ajan:** replace node:ffi with koffi for Node.js FFI backend
- **ajan:** simplify FFI env vars and remove per-runtime backend selection

## 4.1.44 - 2026-03-30

### Added

- **noskills:** add spec splitting, git write-bypass detection, and batch task
  completion

## 4.1.43 - 2026-03-30

### Added

- **noskills:** add FREE mode, OpenCode/Codex/Copilot CLI adapters, and live
  state machine coaching

## 4.1.42 - 2026-03-30

### Added

- **noskills:** add per-tool interaction hints and require explicit --spec flag

## 4.1.41 - 2026-03-29

### Added

- **noskills:** add adapter pattern for sync engine with full Kiro integration

## 4.1.40 - 2026-03-29

### Changed

- **noskills:** update Twitter handle typo

## 4.1.39 - 2026-03-29

### Added

- **noskills:** discovery review phase, verifier agent, --spec flag
- **noskills:** deep discovery, ID-based debt, sub-agent delegation

## 4.1.38 - 2026-03-29

### Added

- **noskills:** discovery review phase, verifier agent, --spec flag
- **noskills:** deep discovery, ID-based debt, sub-agent delegation

## 4.1.37 - 2026-03-28

### Added

- **noskills:** make discovery phase probe deeper instead of relaying verbatim

## 4.1.36 - 2026-03-28

### Added

- **noskills:** batch concern add, phase-aware options, one-at-a-time discovery
  flow

## 4.1.35 - 2026-03-28

### Added

- **noskills:** use PATH-based CLI detection and update setup docs

### Fixed

- **codebase:** harden regex patterns and prototype pollution guards

## 4.1.34 - 2026-03-28

### Added

- **noskills:** replace availableActions with interactiveOptions for native tool
  UX

## 4.1.33 - 2026-03-28

### Added

- **noskills:** add agent detection, session-start hook, and IDLE actions

## 4.1.32 - 2026-03-28

_Maintenance release._

## 4.1.31 - 2026-03-28

### Added

- **noskills:** replace filesystem concern loading with static imports

## 4.1.30 - 2026-03-28

### Added

- **standards:** add TTY detection and raw mode to cross-runtime process

## 4.1.29 - 2026-03-28

### Added

- **noskills:** add execution engine, hooks, TUI prompts, and output formatting

## 4.1.28 - 2026-03-27

### Changed

- ***:** consolidate all config under .eser/ directory

## 4.1.27 - 2026-03-27

### Fixed

- **codebase:** emit maintenance release section instead of throwing on
  chore-only changelogs

## 4.1.25 - 2026-03-27

### Changed

- **standards:** rename runtime to cross-runtime, registry to collections

## 4.1.24 - 2026-03-27

### Added

- **codebase:** add group aliases in help, fix semver version check

## 4.1.22 - 2026-03-27

### Added

- **cli:** add "." alias for codebase submodule

## 4.1.20 - 2026-03-26

### Changed

- **laroux:** split server/CLI into laroux-server and slim down laroux to shared
  types

## 4.1.19 - 2026-03-26

### Added

- **noskills:** introducing noskills.

## 4.1.18 - 2026-03-26

### Fixed

- **workflows:** circular dependency issues is fixed by removing codebase
  dependency.

## 4.1.17 - 2026-03-26

### Fixed

- **stream:** circular dependency issues is fixed by removing encode/decode
  exports.

## 4.1.16 - 2026-03-26

### Added

- **ai:** introducing @eserstack/ai

## 4.1.15 - 2026-03-26

### Added

- **shell:** scalable module system.

### Fixed

- **codebase:** prompt was incorrectly placed.

## 4.1.14 - 2026-03-26

### Added

- **streams:** introducing @eserstack/streams

## 4.1.13 - 2026-03-25

### Added

- **streams:** introducing @eserstack/streams.

## 4.1.12 - 2026-03-19

### Fixed

- **ci:** allow homebrew/nix update jobs to fail when app credentials missing.
- **ci:** skip homebrew/nix jobs when app credentials not configured.

## 4.1.11 - 2026-03-19

### Fixed

- **ci:** add checkout step to upload-assets job.

## 4.1.10 - 2026-03-19

### Changed

- **deps:** bump google.golang.org/grpc from 1.79.2 to 1.79.3 in /apps/services

## 4.1.9 - 2026-03-18

### Fixed

- **codebase:** convert validate-licenses to createFileTool factory

## 4.1.8 - 2026-03-16

### Fixed

- **codebase:** fixed changelog generation scripts

## 4.1.7 - 2026-03-16

### Fixed

- **codebase:** fixed changelog generation scripts.

## 4.1.6 - 2026-03-16

### Added

- **codebase:** gh sub-commands
- **codebase:** release, rerelease and unrelease commands.

### Changed

- ***:** updated documentations.

## 4.1.5 - 2026-03-14

### Added

- **codebase:** categorized codebase tools.
- **codebase:** updated validate-commit-msg tool to support multiple and
  asterisk scope.

## 4.1.4 - 2026-03-14

### Added

- **codebase:** categorized codebase tools.
- **codebase:** updated validate-commit-msg tool to support multiple and
  asterisk scope.

## 4.1.3 - 2026-03-14

### Fixed

- **codebase:** resolved some security issues

## 4.1.2 - 2026-03-14

### Added

- **standards:** walk and colors features for various runtimes.
- **functions:** context-aware tasks, and adapters.
- **bundler:** add Deno module resolution fallback for npm packages
- **bundler:** add projectRoot configuration for module resolution
- **bundler:** enhance Deno bundler output mapping for entry keys
- **bundler:** enhance server action handling with client stubs and reference
  symbols
- **bundler:** implement server action transformation and manifest generation
- **bundler:** add server externals plugin to bundler configuration
- **bundler:** enhance server and client bundling with externals support
- **bundler:** implement policy for external import specifiers in bundling
  process
- add support for imports, dependencies, and devDependencies in package loader
- **laroux:** laroux packages are introduced.
- **bundler:** introduce new testing framework and enhance CSS processing
  capabilities
- added formatting utilities in @eserstack/standards for better number, size,
  duration, and percentage representation.
- introduced new utilities in the @eserstack/standards package, including date
  and time formatting, internationalization, and string interpolation functions.
- **fp:** introduced new utility functions, including chunk, get, groupBy,
  keyBy, and memoize, along with their respective tests and benchmarks.
- added @eserstack/primitives package to provide utility functions and promises.
- CLI and documentation enhancements
- ***:** add FakeServer and temp directory utilities for testing
- **@eserstack/cs:** minor changes to ready shipping.
- ***:** bump all versions feature

### Changed

- **laroux:** update project structure and configuration for laroux-app
- **laroux:** enhance regex patterns to prevent ReDoS vulnerabilities
- **laroux:** enhance global type definitions for Laroux runtime
- **laroux:** add return types to various functions for improved type safety
- **bundler:** streamline module and chunk manifest generation
- **standards:** simplify runtime entry points by consolidating to a single
  default path.
- **@eserstack/cs:** remove builders and config files; update CLI and generate
  functionality
- bumped to deno version 2.x

### Fixed

- **codebase:** resolved some security issues
- **codebase:** check-licenses pwd fix.
- shebang consideration.
- **bundler:** update import map resolver for object property access.
- **bundler:** enhance import map resolver
- **bundler:** prevent import path rewriting for action modules
- **bundler:** include server action files in server bundling process
- **laroux:** mark action-registry as external in the bundler configuration to
  ensure bundled actions share the server's registry.
- **laroux:** update dynamic import paths in middleware and route dispatchers to
  comply with Deno's publishing requirements by using file:// protocol.
- **laroux:** mark action-registry as external in the bundler configuration to
  prevent inlining of a local copy, ensuring shared usage of the server's
  registry.
- **laroux:** ensure dynamic imports of server actions are assigned to a
  variable to comply with Deno's publishing requirements, improving import
  handling.
- **laroux:** improved server action loading logic in main.ts to check for the
  existence of the actions file before attempting to import it, providing better
  error handling.
- excluded templates from deno tooling.
- added .npmrc files to templates.
- **laroux:** npm publishing fix.
- **laroux:** improve handling of undefined values in logging and JSR resolver
  plugin
- **laroux:** improve handling of undefined values in various functions
- **laroux:** improve error handling and path management in various functions
- **bundler:** update main entrypoint handling to support null values and custom
  entry names
- **bundler:** update Tailwind CSS plugin reference in deno.json to use
  tailwind-plugin.ts.
- **bundler:** enhance chunk extraction logic to locate component exports when
  proxy files are absent.
- **bundler:** enhance map decoding logic to handle null values more
  effectively.
- **bundler:** improve buffer decoding to handle null/undefined inputs safely.
- **bundler:** the referenceFile is calculated as a relative path from the CSS
  module's directory.
- **logging:** specify FormatterFn type for default text and ANSI color
  formatters for improved type safety.
- **bundler:** ensure stop method returns a promise for consistent behavior.
- updated validation commands in package.json to use the new validation
  structure for licenses.
- **@eserstack/cli:** --help identifier fix.
- jsr package name resolution bug.
- ensure output writer lock is released on write failure
- **scripts:** version bump script
- **scripts:** deno.jsonc -> deno.json
