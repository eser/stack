---
id: TASK-113
title: Let kit clone users raise the tarball extraction limits
status: Done
assignee: []
created_date: '2026-10-04 20:51'
updated_date: '2026-10-05 01:00'
labels:
  - kit
  - feature
dependencies: []
references:
  - pkg/@eserstack/kit/recipes/recipe-applier.ts
  - pkg/@eserstack/kit/recipes/tar.ts
priority: low
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
applyWholeRepo calls extractTarball with only stripComponents and subpath (pkg/@eserstack/kit/recipes/recipe-applier.ts:434-437), so the TASK-30 defaults (256 MiB, 20,000 entries) always apply. A user cloning a subpath of a large monorepo cannot raise them, even though the TarballLimitError message suggests raising maxBytes and maxEntries. Rules: coding-practices: Bound Every Resource, Configuration Precedence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ApplyOptions carries maxBytes and maxEntries through to ExtractOptions
- [x] #2 kit clone exposes them as flags or settings with environment over config over default
- [x] #3 A test shows a raised limit lets a larger archive through
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Completed in the autonomous backlog run on 2026-10-05; deno task cli ok passes apart from checks owned by tasks still in progress.

kit: Verified. ApplyOptions.maxBytes and maxEntries reach extractTarball in applyWholeRepo, and CloneRecipeInput forwards them. commands/clone.ts takes --max-bytes and --max-entries and the ESER_KIT_MAX_BYTES and ESER_KIT_MAX_ENTRIES variables. A pure resolveExtractLimits applies flag, then variable, then default, and treats an empty variable as unset. Values must be positive safe integers, and a bad one fails with a RangeError before any network call. Kit reads no config file, so there is no file layer, and coding-practices: Configuration Precedence still holds (environment over default). The FFI path is used only for file-list recipes and never for tarballs, so the limits cannot be bypassed there.
<!-- SECTION:NOTES:END -->
