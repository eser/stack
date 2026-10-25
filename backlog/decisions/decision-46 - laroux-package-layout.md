---
id: decision-46
title: laroux package layout
date: '2026-10-23 20:35'
status: accepted
---

## Context

doc-2 proposed eight packages for laroux: bundler, laroux-rsc, laroux-dev, laroux-server, laroux, laroux-react, laroux-bundler and laroux-start. All TypeScript packages share one version, so a separate package buys no independent release cadence. dist/server/index.js is fully bundled, so a package boundary between the dev server and the production host does not keep dev dependencies out of production. @eserstack/bundler has one consumer, laroux-bundler. laroux-bundler mixes generic build code (css-processor, build-cache, chunk-manifest) with laroux-only code (route-scanner, route-generator, framework-plugin, server-action-transform, client-action-stub).

## Options

- Eight packages as in doc-2
- Three packages: @eserstack/laroux, @eserstack/laroux-server and @eserstack/bundler
- Two packages, with @eserstack/bundler folded into laroux-server/build/

## Decision

Three packages.

- @eserstack/laroux holds everything app code imports: `/config` (defineConfig and types), `/client` (Link, router, hydration, navigation, image) and `/rsc` (the Flight runtime vendored under `vendor/`, the server reference registry and action dispatch), plus `/rsc/transforms` for the "use client" and "use server" transforms. It takes today's laroux and laroux-react, the planned laroux-rsc, and server-action-transform and client-action-stub from laroux-bundler.
- @eserstack/laroux-server is the tool that builds and serves an app, published to npm as `laroux` with the `laroux` bin (decision-47). It holds `cli/`, `dev/`, `adapters/native` (route-scanner, route-generator and framework-plugin from laroux-bundler), `adapters/start` (the TanStack Start adapter, with the TanStack packages as optional peer dependencies) and `runtime/` (the fetch host bundled into dist/server/index.js). The FrameworkAdapter port lives here, because only the tool uses it.
- @eserstack/bundler stays free of React and laroux: rolldown environments (client, ssr, rsc), the plugin runner, CSS, chunk manifest, module map and build cache. It takes the generic parts of laroux-bundler.

laroux-bundler and laroux-react are removed, and laroux-rsc, laroux-dev and laroux-start are never created. Dependencies point one way: laroux-server depends on laroux and bundler, laroux has only react as a peer, and bundler depends on no laroux package. A validator fails when laroux-server/runtime/ imports from cli/ or dev/, or when bundler imports react or a laroux package.

## Decided by

The owner chose three packages on 2026-10-23.

## Blocks

Track L tasks TASK-280 to TASK-317 (doc-3). Supersedes the package split in doc-2's Summary and Components sections.

Plan key: `laroux-package-layout`

## Amended

decision-53 (2026-10-23) removes `adapters/start` and the optional TanStack peer dependencies from laroux-server.
