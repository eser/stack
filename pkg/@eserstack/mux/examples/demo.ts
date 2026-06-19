// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Minimal runnable demo: a standalone multiplexer running your shell.
 *
 * Run in a real terminal:
 *   deno run -A pkg/@eserstack/mux/examples/demo.ts
 *
 * Keys: ctrl+p then v/s to split, hjkl to move focus, x to close a pane;
 * ctrl+t then n for a new tab, h/l to switch; ctrl+q to quit. (See the default
 * keymap for the full set.) A real PTY needs the @eserstack/ajan native library
 * built; otherwise it falls back to the script-based PTY on macOS/Linux.
 *
 * @module
 */

import { runInProcess } from "../runner/inprocess.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

const code = await runInProcess();
runtime.process.exit(code);
