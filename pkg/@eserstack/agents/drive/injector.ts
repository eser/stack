// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Inject a message into an agent's terminal: bracketed paste (so multi-line text
 * isn't interpreted as commands or submitted early) followed by the adapter's
 * submit key.
 *
 * @module
 */

import type { AgentAdapter } from "../adapter.ts";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

export const inject = (
  write: (data: string) => void,
  adapter: AgentAdapter,
  text: string,
): void => {
  if (adapter.capabilities.supportsBracketedPaste) {
    write(PASTE_START + text + PASTE_END);
  } else {
    write(text);
  }

  write(adapter.submitSequence());
};
