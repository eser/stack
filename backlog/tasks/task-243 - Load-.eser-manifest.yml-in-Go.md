---
id: TASK-243
title: Load .eser/manifest.yml in Go
status: Done
assignee: []
created_date: '2026-10-15 20:38'
updated_date: '2026-10-24 19:10'
labels:
  - go
  - workflowfx
milestone: m-3
dependencies:
  - TASK-174
priority: high
ordinal: 243000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a Go loader for the workflows and scripts in .eser/manifest.yml, validated against docs/schema/manifest.json, that produces workflowfx definitions. The TS loader it replaces is pkg/@eserstack/workflows/loader.ts:121-129. This is Go-only work.

Plan key: M3-T2. Effort: medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The loader parses the repo manifest and every recipe manifest; tests cover each step kind
- [x] #2 Its errors name the file and the YAML path; `make ok` passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-24. pkg/ajan/workflowfx/manifest.go: LoadManifest(dir) tries .eser/manifest.yml, .eser/manifest.yaml and the legacy .manifest.yml/.yaml in the TS loader's order (ErrManifestNotFound when none); ParseManifest(file, content) parses with yaml.v3's node API, validates against the manifest schema, and returns WorkflowsConfig (Stack, Workflows as *WorkflowDefinition, and the new Scripts map of ScriptConfig{Command, Description, WorkingDirectory, Depends}). Steps: a string names a tool; a one-key map names the tool and holds its options; continueOnError, timeout (seconds, above 0 and at most 2,147,483, the TS engine's timer ceiling), if, bypass, loop {over, as, asIndex} and inputSchema are taken out as StepConfig directives (the TS resolveStep extracts only the first two; the rest are Go engine directives with no TS user). docs/schema/manifest.json described only the noskills keys with additionalProperties false, so the repo manifest could not validate: it gained stack, workflows, scripts and exports (the laroux-runtime-app recipe manifest's only key) with $defs for workflow, step, stepOptions and script; the noskills keys are unchanged. The schema is embedded as workflowfx/manifest_schema.json and TestManifestSchemaMatchesTheDocsSchema keeps it byte-identical to the docs copy. Errors are *ManifestError (wrapping ErrInvalidManifest, joined when several) formatted 'file:line: yaml.path: message', e.g. '.eser/manifest.yml:6: workflows[0].steps[0].shell.timeout: exclusiveMinimum: got 0, want 0'; unknown keys are reported at the key ('m.yml:1: workflowz: unknown key ...'); YAML syntax errors carry yaml.v3's line. Tests (manifest_test.go): the repo manifest (3 workflows, the build-native-lib shell step's 300 s timeout kept out of the options, scripts.ok and scripts.test), every .eser/recipes/*/manifest.y*ml, each step kind (bare name, empty options, options, shell with timeout and continueOnError, if+bypass, loop, inputSchema, includes), six error cases (bad timeout, missing id, two tools in one step, unknown top-level key, YAML syntax, script without command), the filename order and the missing case. Also ran go mod tidy in both modules (the bridge module dropped the OTel SDK requirements after TASK-278). make ok and deno task cli ok passed.
<!-- SECTION:NOTES:END -->
