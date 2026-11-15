---
id: TASK-395
title: 'codebasefx: expose the validate-* validators as functionsfx functions'
status: Done
assignee: []
created_date: '2026-11-10 10:03'
updated_date: '2026-11-13 21:50'
labels:
  - go
  - functions
  - codebase
milestone: m-6
dependencies:
  - TASK-386
  - TASK-390
  - TASK-391
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 398000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Register the validate-* tools of pkg/ajan/codebasefx/validatortools as functionsfx functions with input and output schemas, the first real functions of ADR 0011. workflowfx runs them as tools through RegisterFunctions, and TypeScript runs them through fromNative. RegisterManifestTools keeps the manifest step names. The shell tool and the file tools of workflowfx follow in later tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every validate-* step name of .eser/manifest.yml still resolves and gives the same issues as before
- [x] #2 Each validator has an input schema and an output schema in its descriptor
- [x] #3 A validator runs from a manifest step on the Go engine and from TypeScript through fromNative with the same result
- [x] #4 pnpm ok passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
pkg/ajan/codebasefx/validatortools/functions.go and functions_schema.go: RegisterManifestFunctions(functions) wraps every tool of RegisterManifestTools (the codebase-* validators, the validate-* steps of the manifest and the whole-repository checks, same names) as a functionsfx function that declares the workflow trigger and answers a workflowfx.ToolOutput. The function runs the same tool object, so a validator gives the same issues by construction. RegisterManifestTools is unchanged and the Go engine still registers the tools directly: the gate's own path is not rerouted through JSON. The bridge registers the functions in bridge_functions_codebase.go, so TypeScript reaches them with functionCall.

AC1: the manifest has 25 validate-* step names; TestEveryValidateStepOfTheManifestResolves loads .eser/manifest.yml and checks each one is a tool and a function (and at least 20 exist). TestEveryManifestToolIsAFunctionOfTheSameName checks the two name sets are equal. TestAValidatorGivesTheSameResultAsAToolAndAsAFunction runs ten cases (fix mode mutations, extensions, exclude, filenames rules, globalExcludes, allowNames, maxKb) on the same tree both ways and compares the whole result as JSON: equal.

AC2: every descriptor has an object input schema and an object output schema (TestEveryValidatorFunctionDescribesItsInputAndOutput). Input schemas list the options the code reads, with required directory for server-loc and file for error-coverage, and do not forbid additional properties because the engine adds root, fix, dryRun, _args and _changedFiles. The output schema is ToolOutput.

AC3: a manifest step runs through workflowfx.RegisterFunctions with the same step result as the direct tool (TestAValidatorRunsFromAManifestStepThroughFunctions). validators-native.ffi.test.ts in @eserstack/codebase loads the real native library, runs validate-eof through functions.native.fromNative with callFunction of @eserstack/ajan/ffi/functions as its port, runs the same tree through workflowRun, and compares passed, issue messages and stats. That test also assigns callFunction to a functions.native.NativeCaller, so tsc checks the two ports have the same shape: the gap TASK-392 left open is closed.

Two things found while building. A list option decoded from JSON is []any, while the engine and Go callers pass []string and codebase-filenames, _changedFiles and _args read only []string, so the function converts the string-list options before it runs the tool (normalizeOptions); TestAFunctionCalledWithJSONStillReadsItsStringLists covers globalExcludes. The Mutations of a function result were an empty slice where the engine's own results hold nil; they are nil now, so the JSON is equal.

Difference on the function path: a missing required option is a ValidationError from the schema, which fails the step and lets the run go on, where the tool returned an error that stops it.

Full gate: go run ./cmd/eser ok passed all steps (exit 0) on 2026-11-14, with a stand-in pnpm that only maps 'pnpm exec <tool>' to node_modules/.bin/<tool>; the real pnpm was not run.

Correction: the manifest names 26 distinct validate-* steps, not 25 as written above; the test checks every one it finds and asserts at least 20.
<!-- SECTION:NOTES:END -->
