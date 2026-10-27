---
id: TASK-372
title: 'laroux: help flags for dev, build and serve, and a scaffold that matches the installed version'
status: To Do
assignee: []
created_date: '2026-10-27 17:00'
labels:
  - laroux
  - kit
  - bug
dependencies:
  - TASK-370
priority: medium
ordinal: 375000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during TASK-370:
- `laroux dev`, `laroux build` and `laroux serve` declare no help flag. The root command handles `--help` only before the command name (pkg/@eserstack/shell/args/command.ts), so `laroux dev --help` reaches the command's main and would start the dev server instead of printing help. Read from the code, not run.
- The laroux-app recipe's package.json is named `@test/laroux-app` and does not use the `project_name` variable, so every scaffolded app carries that name.
- `laroux init` reads kit's default registry, eser/stack's `.eser/recipes.json` on main. A user on an older laroux gets main's recipe, not the one that matches the installed version. Pinning the registry URL to the release tag of the installed version would keep the scaffold and the tool in step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `laroux dev --help`, `laroux build --help` and `laroux serve --help` print help and start nothing, with a test for each
- [ ] #2 A project scaffolded from laroux-app has the project's name in its package.json
- [ ] #3 `laroux init` without `--registry` reads the recipes of the installed laroux version, or the task notes record why main stays the default
<!-- AC:END -->
