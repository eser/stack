// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * laroux.js CLI module definition.
 *
 * @module
 */

import { Module } from "@eser/shell/module";

export const moduleDef: Module = new Module({
  description: "laroux.js framework commands",
  modules: {
    init: {
      description: "Create a new laroux.js project",
      load: () => import("./commands/init.ts"),
      flags: [
        {
          name: "template",
          short: "t",
          type: "string",
          description: "Project template (minimal, blog, dashboard, docs)",
          default: "minimal",
        },
        {
          name: "force",
          short: "f",
          type: "boolean",
          description: "Overwrite existing files",
        },
        {
          name: "no-git",
          type: "boolean",
          description: "Skip git initialization",
        },
        {
          name: "no-install",
          type: "boolean",
          description: "Skip dependency installation",
        },
      ],
    },
    dev: {
      description: "Start development server with hot reload",
      load: () => import("./commands/dev.ts"),
      flags: [
        {
          name: "port",
          short: "p",
          type: "number",
          description: "Server port",
          default: 8000,
        },
        {
          name: "no-hmr",
          type: "boolean",
          description: "Disable hot module replacement",
        },
        {
          name: "log-level",
          type: "string",
          description: "Log level (debug, info, warn, error)",
          default: "info",
        },
        {
          name: "open",
          short: "o",
          type: "boolean",
          description: "Open browser automatically",
        },
      ],
    },
    build: {
      description: "Build for production",
      load: () => import("./commands/build.ts"),
      flags: [
        {
          name: "out-dir",
          type: "string",
          description: "Output directory",
          default: "dist",
        },
        {
          name: "clean",
          type: "boolean",
          description: "Clean output directory first",
        },
        {
          name: "no-minify",
          type: "boolean",
          description: "Disable minification",
        },
        {
          name: "analyze",
          type: "boolean",
          description: "Analyze bundle size",
        },
        {
          name: "log-level",
          type: "string",
          description: "Log level (debug, info, warn, error)",
          default: "info",
        },
      ],
    },
    serve: {
      description: "Serve production build locally",
      load: () => import("./commands/serve.ts"),
      flags: [
        {
          name: "port",
          short: "p",
          type: "number",
          description: "Server port",
          default: 8000,
        },
        {
          name: "log-level",
          type: "string",
          description: "Log level (debug, info, warn, error)",
          default: "info",
        },
      ],
    },
  },
});
