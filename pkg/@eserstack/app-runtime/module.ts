// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * A module registered with `AppRuntime.addModule`.
 *
 * The runtime reads only `name`, as the key in `state.modules`. It stores the
 * other fields as given and does not call `entrypoint`; their shapes are open
 * until a module loader consumes them.
 */
export type Module = {
  /** Key in `state.modules`; the constructor name when omitted. */
  name?: string;

  /** Module metadata, such as a version. */
  manifest: unknown;

  /** Names of the modules this module depends on. */
  uses?: ReadonlyArray<string>;
  /** Services this module offers to other modules. */
  provides: ReadonlyArray<unknown>;

  /** Initializes the module. */
  entrypoint: () => void;
};
