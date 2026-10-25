---
id: TASK-250
title: 'Move kit, cs and ai subcommands to Go'
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 21:45'
labels:
  - go
  - kit
  - cs
  - ai
milestone: m-3
dependencies:
  - TASK-245
priority: medium
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose kitfx (add, clone, list, new, update), csfx (generate, sync) and aifx (ask, list, with streaming and cancellation) as `eser kit`, `eser cs` and `eser ai`.

Plan key: M3-T9. Effort: large.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Recipe fixtures produce identical trees from Go and TS; cs generate fixtures match
- [x] #2 eser ai ask and list work against a fake provider in tests
- [x] #3 `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25.
kit (cmd/eser/kit.go on pkg/ajan/kitfx): add, list, new (alias create), clone, update, with every TS flag and output line.
- kitfx closed the gaps against the TS engine, opt-in through new ApplyOptions fields so the bridge keeps its behavior: source base and GitHub endpoints, LoadRegistry/ParseRegistryManifest, TS specifier forms with Subpath, recipe.json from a repo, whole-repo mode with ExtractTarball and the --max-bytes/--max-entries limits, ignore globs ported from @std/path, variable patterns/required/strict, an injected prompt, path substitution, conflict skip, post-install skip/stop, and TS dependency detection and instructions.
- AC #1: cmd/eser/kit_parity_test.go builds registry, whole-repo and recipe.json fixtures behind a local TLS server, runs add (plain, --skip-existing, --dry-run), new (two cases), clone (whole-repo, file list) and update through Go and through the TS CLI (default env and ESER_AJAN=disabled), and compares the trees byte for byte: identical.
- Bridge-visible kitfx changes: absolute targets rejected, dry-run post-install listed, patterns checked, '"default": ""' counts as a default, bare owner/repo is a repo.
- The rebuilt native library let the TS kit FFI path succeed for the first time, which exposed a TS bug: add-recipe.ts read entry.result.written, but the bridge sends recipes flat (bridge_kit.go kitApplyRecipeResult) with empty lists omitted, so 'eser kit add --dry-run' crashed with 'Cannot read properties of undefined'. Fixed by mapping the wire shape; new-project/update/clone now guard the omitted lists.
cs (cmd/eser/cs.go on csfx): generate and sync with -e/-n/-o/-s.
- New csfx EnvLayerFiles/ResolveEnvName/LoadEnvLayers: .env, .env.<env>, .env.local (not for test), .env.<env>.local; the name from -e, then ENV/APP_ENV/DENO_ENV/NODE_ENV, then development. SyncOptions gained EnvFiles, Environ (process variables win), ResourceKeys and OnMissingKey; RunKubectl sorts keys.
- AC #1 (cs): TestCSGenerateMatchesTypeScript runs 5 generate cases through Go and the TS cli.ts with the native library and with ESER_AJAN=disabled. Byte-identical, except YAML against the pure TS path, which is compared as parsed documents because the two YAML writers quote scalars differently.
- Bugs fixed on the way, each with a failing test first:
  - configfx/envparser: 'EMPTY=' swallowed the next line as its value (locateKeyName trimmed the newline; now trims spaces and tabs only).
  - With the native library, TS cs generate read only .env.<env> (generate.ts built one path; the bridge used .env and .env.local without env). The README documents the layers; the bridge now takes 'env' and reads the layers.
  - csfx YAML output was a one-item sequence ('- apiVersion'), which kubectl does not apply; it is one document now.
  - TS buildSecretFromContext put the loader's symbol key in the data as 'Symbol(env)' and base64-encoded Latin-1 (btoa: 'ü' wrong, 'ğ' threw). It now writes UTF-8 base64 with sorted keys, matching Go.
ai (cmd/eser/ai.go on aifx): ask (-p alias, -m, --max-tokens, --effort, -v, --json in the TS GenerateTextResult shape and key order) and list (the TS provider table, --json).
- Streams deltas as they arrive, without the TS typewriter delay.
- Ctrl-C cancels the request context and exits 130.
- AC #2: ai_test.go runs ask (stream, --json, autodetect, usage errors, cancellation mid-stream) and list (fake ollama server, env and PATH detection) against a fake provider factory.
Also: cmd/eser README documents codebase (from TASK-249), cs, ai and kit.
Follow-ups: TASK-319 (envparser and @std/dotenv dialect differences), TASK-320 (the TS YAML writer leaves yes/no unquoted, which kubectl reads as booleans; the cs JSON output is an array), TASK-321 (the kit bridge has no source base), TASK-322 (TS kit behaviors).
Gates: make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
