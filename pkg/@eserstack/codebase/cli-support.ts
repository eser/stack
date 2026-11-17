// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The CLI entry point helpers moved to `@eserstack/shell/cli-support`
 * (TASK-403). This path stays for the 5.x releases, which published it on npm,
 * and is removed in 6.0.0.
 *
 * @deprecated Import from `@eserstack/shell/cli-support` instead.
 *
 * @module
 */

export type { CliContext } from "@eserstack/shell/cli-support";
export {
  attachStandardCommands,
  commandFailureDetail,
  createCliContext,
  createCliOutput,
  exitCli,
  getCliContext,
  parseCliEvent,
  runCliMain,
  runStandaloneModule,
  toCliEvent,
} from "@eserstack/shell/cli-support";
