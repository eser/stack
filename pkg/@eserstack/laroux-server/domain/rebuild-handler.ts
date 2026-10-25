// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Rebuild Handler
 *
 * Decides what the dev server does after each watch-mode rebuild: after one
 * that succeeded, it loads the rebuilt server modules and then tells the HMR
 * clients to update; after one that failed, or when the rebuilt modules fail
 * to load, it reports the failure and sends the clients no update.
 */

import type { BuildResult } from "@eserstack/laroux-bundler/system";
import type { HMRManager } from "./hmr-manager.ts";

/**
 * Message HMR clients get after a failed rebuild. It carries no error detail;
 * the dev server log has the failing step and its error.
 */
export const REBUILD_FAILED_MESSAGE =
  "The rebuild failed; the dev server log names the failing step and its error";

/**
 * Message HMR clients get when the rebuild succeeded but the server could not
 * load its modules. It carries no error detail; the dev server log has it.
 */
export const RELOAD_FAILED_MESSAGE =
  "The server could not load the rebuilt modules; the dev server log has the error";

/** The parts of a build result the handler reads. */
export type RebuildOutcome = Pick<
  BuildResult,
  "success" | "buildId" | "duration" | "timestamp" | "changedFiles"
>;

/** The log calls the handler makes; a @eserstack/logging logger has them. */
export type RebuildLogger = {
  /** Log a successful rebuild */
  info(message: string): unknown;
  /** Log a failed rebuild */
  error(message: string): unknown;
  /** A logger whose entries carry these attributes */
  with(attributes: Record<string, unknown>): RebuildLogger;
};

/** Dependencies of {@link createRebuildHandler}. */
export type RebuildHandlerOptions = {
  /** HMR clients to notify; null when HMR is off */
  readonly hmr: Pick<HMRManager, "notifyUpdate" | "notifyError"> | null;
  /**
   * Loads the server modules of the rebuilt output, given the build id of
   * the rebuild. Runs after a successful rebuild, before the clients update;
   * when it rejects, the clients get an error instead of the update.
   */
  readonly onRebuilt: (buildId: string) => Promise<void>;
  /** Logger for the outcome of each rebuild */
  readonly logger: RebuildLogger;
};

/**
 * Create the callback that system.watch() calls after each rebuild. The
 * watcher waits for the promise it returns before the next rebuild.
 *
 * @param options - HMR clients, the module loader and the logger
 * @returns The callback for one watcher
 */
export function createRebuildHandler(
  options: RebuildHandlerOptions,
): (result: RebuildOutcome) => Promise<void> {
  const { hmr, onRebuilt, logger } = options;

  return async (result) => {
    if (!result.success) {
      // The bundler has logged the failing step and its error; this line
      // reports the outcome, and the clients keep the page they have.
      await logger.error(
        "✗ Rebuild failed, so no HMR update was sent; fix the error logged above and save to rebuild",
      );
      hmr?.notifyError(REBUILD_FAILED_MESSAGE);
      return;
    }

    try {
      await onRebuilt(result.buildId);
    } catch (error) {
      // Handled here: logged once, and the clients keep the page they have.
      // ServerModules.load leaves the pages on the build loaded before.
      await logger
        .with({ buildId: result.buildId, error })
        .error(
          "✗ Loading the rebuilt server modules failed, so no HMR update was sent; fix the error and save to rebuild",
        );
      hmr?.notifyError(RELOAD_FAILED_MESSAGE);
      return;
    }

    await logger.info(`✓ Compiled in ${result.duration.toFixed(0)}ms`);
    hmr?.notifyUpdate(result.timestamp, result.changedFiles);
  };
}
