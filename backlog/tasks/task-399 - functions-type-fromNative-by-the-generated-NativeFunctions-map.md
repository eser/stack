---
id: TASK-399
title: 'functions: type fromNative by the generated NativeFunctions map'
status: Done
assignee: []
created_date: '2026-11-14 05:43'
updated_date: '2026-11-14 05:45'
labels:
  - typescript
  - functions
milestone: m-6
dependencies:
  - TASK-394
references:
  - docs/adr/0011-native-functions-behind-the-bridge.md
priority: medium
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add fromNativeOf and fromNativeStreamOf to @eserstack/functions/native. They take the generated NativeFunctions map as a type argument and the port as an argument, and return a function of the name, so the input and output of a native function are read from the map instead of written by hand. A name the map lacks, a streaming name given to fromNativeOf (or the reverse) and an input of the wrong shape fail to compile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fromNativeOf and fromNativeStreamOf read input, output and the stream flag from a NativeFunctionMap, with type tests that fail to compile on an unknown name, the wrong kind of name and a wrong input
- [x] #2 The generated maps of @eserstack/codebase and @eserstack/workflows satisfy NativeFunctionMap, shown by the ffi tests that call through them on the real library
- [x] #3 The functions README, the API table and ADR 0011 describe them
- [x] #4 The full gate passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
native.ts: NativeFunctionMap, NativeCallNames, NativeStreamNames, fromNativeOf and fromNativeStreamOf. The map is the first type argument and the name comes from a second call, because TypeScript cannot give a type argument in part (fromNative<Map>(caller, name) would need Map and the name type together). isolatedDeclarations needed an explicit return type on the stream form. Type tests in native.test.ts use @ts-expect-error for an unknown name, a streaming name given to fromNativeOf, a call-once name given to fromNativeStreamOf and a wrong input; tsc fails if one of them stops erroring. The ffi tests of @eserstack/codebase now call validate-eof, validate-large-files and workflow-steps through the generated maps, which checks that the generated maps satisfy NativeFunctionMap. The error-path tests keep fromNative with explicit types, because they call names the map lacks on purpose. fromNative and fromNativeStream stay for functions the map does not describe. Not changed: the header of the generated file still says fromNative. Full gate: 36 passed, exit 0, through the pnpm exec shim.
<!-- SECTION:NOTES:END -->
