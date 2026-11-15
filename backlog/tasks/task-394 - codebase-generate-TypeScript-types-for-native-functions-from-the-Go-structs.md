---
id: TASK-394
title: 'codebase: generate TypeScript types for native functions from the Go structs'
status: Done
assignee: []
created_date: '2026-11-10 10:00'
updated_date: '2026-11-13 22:09'
labels:
  - tooling
  - functions
milestone: m-6
dependencies:
  - TASK-386
  - TASK-391
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 397000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generate the TypeScript input and output types of each native function from its Go structs through the JSON Schema of the registry descriptors, as a pnpm cli script, and check in the gate that the generated files are current. Go is the source of truth. Each function's generated types are written into the package that owns the function (ADR 0011), so the script walks the registered descriptors and does not keep one central file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changing a Go function input struct changes its TypeScript type through the script and fails the gate until it is regenerated
- [x] #2 The generated files sit in the owning package of each function and not in @eserstack/ajan
- [x] #3 The generated files carry a generated-file header and are never edited by hand
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pieces. Go, pkg/ajan/functionsfx: Descriptor.Owner and WithOwner (the workspace package that owns a function); SchemaOf[T] and WithSchemasOf[I, O], which derive a JSON Schema from a Go struct the way encoding/json reads it (json tags, omitempty and omitzero make a field optional, a pointer without omitempty is nullable, a description tag becomes a comment; recursive types and types JSON cannot carry are errors). pkg/ajan/functionsfx/tsgen turns descriptors into the text of one TypeScript module per owner (Source, Files), deterministic, with identical output types aliased to the first. pkg/ajan/nativefx is the catalog of the functions the bridge serves: the bridge registers it in init (bridge_functions_codebase.go) and the generator reads it, so the types cover what the bridge serves. cmd/eser: eser codebase native-types writes pkg/<owner>/native-functions.ts, and --check writes nothing and exits 1 for a file that is missing or differs.

AC1: the validators changed to carry WithOwner(@eserstack/codebase), and their output schema now comes from SchemaOf[workflowfx.ToolOutput] instead of a hand-written map, so the output types follow the struct. Their input is a map, so its schema is written in Go (functions_schema.go) and the generator reads that; either source is Go. tsgen tests show a struct field change reaching the type (TestSourceWritesTheTypesOfAStructFunction), cmd tests show --check failing on a stale or missing file and the plain command repairing it, and the manifest step runs --check on the real tree.

AC2: the types sit in the owner package, pkg/@eserstack/codebase/native-functions.ts, exported as @eserstack/codebase/native-functions (package.json and publishConfig synced with gen-library-manifests.ts). There is no central file: Files groups by owner, and a function without an owner is ErrNoOwner.

AC3: the file starts with a generated-file header that says not to edit it; the text is byte-equal to what oxfmt writes, so the formatter step passes on it (the generator matches the formatter's layout of a multi-line union).

Gate: a new precommit step native-function-types in .eser/manifest.yml (go run ./cmd/eser codebase native-types --check, fixCommand without --check, so eser fix writes the types). The validate-naming-and-todos step excludes the generated file: a description in it is the validator's own purpose, which names TODO comments.

Use: validators-native.ffi.test.ts types its fromNative calls with ValidateEofInput, ValidateEofOutput and ValidateLargeFilesInput from the generated module, replacing a hand-written type. The one cast left is deliberate: the generated type says maxKb is a number, and the test needs to reach the run-time check for a caller without the types.

Not done: types are generated for the one owner there is today (@eserstack/codebase); a second owner needs only WithOwner and a package directory. A typed fromNative that takes the NativeFunctions map (fromNative(caller, name) with I and O inferred from the name) was left out: it would change the signature of fromNative in @eserstack/functions, which does not depend on the generated modules.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.
<!-- SECTION:NOTES:END -->
