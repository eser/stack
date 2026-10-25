---
id: decision-47
title: How laroux apps import laroux from npm
date: '2026-10-23 20:35'
status: accepted
---

## Context

The npm package `laroux` is today a single-file bundle of the CLI. Apps import @eserstack/laroux and @eserstack/laroux-react from JSR through `npm:@jsr/eser__*` specifiers, and that path ends when JSR freezes at 4.5.x (decision-5). .eser/recipes/laroux-app also imports `@eserstack/laroux-core/config/schema` and `@eserstack/laroux-core/router`, which do not exist.

## Options

- One npm package `laroux` with the bin and subpath exports such as `laroux/client`
- App code imports the scoped @eserstack packages from npm, and the bare `laroux` package is the tool

## Decision

The second option, the same as every other package in the repo. App code imports from `@eserstack/laroux` (and `@eserstack/laroux-react` until track L merges it), installed from npm. The bare npm packages `laroux` and `eser` exist to run the tools through their bins. A laroux app lists `@eserstack/laroux` in dependencies and `laroux` in devDependencies, and its scripts call `laroux dev`, `laroux build` and `laroux serve`.

## Decided by

The owner chose this on 2026-10-23.

## Blocks

TASK-237 (M2-T6), track L tasks TASK-280 to TASK-317 (doc-3).

Plan key: `laroux-npm-imports`
