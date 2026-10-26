// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Keypresses and terminal resizes, read by Node.
 *
 * One process cannot share its terminal between Go and Node (decision-37,
 * measurement (d) of TASK-175): when Node first touches stdin it reopens the
 * tty, which silently ends a Go reader of `os.Stdin` (and on macOS blocks
 * Node's main thread until Go's read returns), and SIGWINCH reaches only the
 * side that installed its handler last. So the terminal belongs to Node:
 * keys come from `runtime.process.stdin`, raw mode from
 * `runtime.process.setStdinRaw` (see `withRawMode`), and resizes from the
 * SIGWINCH listener and `runtime.process.consoleSize`.
 *
 * The module is the one owner of stdin while a reader is open. Each key goes
 * to exactly one reader, the one opened last; when it ends, the reader before
 * it gets the next key. Stdin is read only while a reader waits, and when the
 * last reader ends the module lets go of it, so a key typed after that waits
 * for the next reader and stdin does not keep the process alive. A reader that
 * ends while it waits (its signal aborts) leaves that one read open, which
 * does.
 *
 * @example
 * ```typescript
 * import * as tui from "@eserstack/shell/tui";
 *
 * await tui.withRawMode(async () => {
 *   for await (const event of tui.readTerminalEvents()) {
 *     if (event.name === "resize") {
 *       console.log(`${event.cols}x${event.rows}`);
 *     } else if (event.name === "q") {
 *       break;
 *     }
 *   }
 * });
 * ```
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as keypress from "./keypress.ts";

/** A key read from the terminal, or a resize (`name: "resize"`). */
export type TerminalEvent = keypress.KeypressEvent & {
  /** The new width in columns, on "resize" events only. */
  readonly cols?: number;
  /** The new height in rows, on "resize" events only. */
  readonly rows?: number;
};

/** One open reader: the events it has not taken yet, and its waiting take. */
interface Reader {
  readonly events: TerminalEvent[];
  /** Set while the reader waits for an event; delivering one clears it. */
  wake: (() => void) | null;
}

/** Readers in the order they opened; the last one gets the events. */
const readers: Reader[] = [];
let stdinReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let reading = false;
// Set when stdin reached its end: every open reader then ends too.
let inputEnded = false;

const wakeReader = (reader: Reader): void => {
  const wake = reader.wake;
  reader.wake = null;
  wake?.();
};

const deliver = (event: TerminalEvent): void => {
  const reader = readers.at(-1);
  if (reader === undefined) {
    return;
  }

  reader.events.push(event);
  wakeReader(reader);
};

const onResize = (): void => {
  const { columns, rows } = runtime.process.consoleSize();

  deliver({
    name: "resize",
    ctrl: false,
    meta: false,
    shift: false,
    raw: new Uint8Array(0),
    cols: columns,
    rows,
  });
};

/**
 * Reads the next key while a reader waits for one. Reading only on demand
 * keeps no read open once the readers have what they asked for: an open read
 * of stdin would keep the process alive after the last reader ends.
 */
const readOnDemand = (): void => {
  const source = stdinReader;
  if (
    source === null ||
    reading ||
    inputEnded ||
    !readers.some((reader) => reader.wake !== null)
  ) {
    return;
  }

  reading = true;
  source.read().then(
    (chunk) => {
      reading = false;
      if (stdinReader !== source) {
        return;
      }

      if (chunk.done) {
        inputEnded = true;
        for (const reader of readers) {
          wakeReader(reader);
        }
        return;
      }

      deliver(keypress.parseKeypress(chunk.value));
      readOnDemand();
    },
    () => {
      // The last reader let go of stdin while this read waited.
      reading = false;
    },
  );
};

const attach = (): void => {
  // Read the size once first: on Node that creates process.stdout, whose own
  // SIGWINCH listener updates the size, before the listener added here runs.
  runtime.process.consoleSize();
  runtime.process.addSignalListener("SIGWINCH", onResize);

  stdinReader = runtime.process.stdin.getReader();
  inputEnded = false;
};

const detach = (): void => {
  runtime.process.removeSignalListener("SIGWINCH", onResize);

  const source = stdinReader;
  stdinReader = null;
  // A read still open (a reader that ended while it waited) fails here; the
  // stream keeps what arrives after this for the next reader.
  source?.releaseLock();
};

/**
 * Yields keypresses and resizes until `signal` aborts, the caller stops or
 * stdin ends.
 * Put the terminal in raw mode first (`withRawMode`), or keys arrive a line
 * at a time.
 *
 * @param signal - Ends the reader
 */
export const readTerminalEvents = async function* (
  signal?: AbortSignal,
): AsyncGenerator<TerminalEvent, void, unknown> {
  // A function, so each check reads the signal again.
  const aborted = (): boolean => signal?.aborted === true;
  if (aborted()) {
    return;
  }

  const reader: Reader = { events: [], wake: null };
  readers.push(reader);
  if (readers.length === 1) {
    attach();
  }

  const onAbort = (): void => {
    wakeReader(reader);
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    while (!aborted()) {
      const event = reader.events.shift();
      if (event !== undefined) {
        yield event;
        continue;
      }

      if (inputEnded) {
        return;
      }

      // Events reach this reader one at a time, in order.
      // oxlint-disable-next-line no-await-in-loop
      await new Promise<void>((resolve) => {
        reader.wake = resolve;
        readOnDemand();
      });
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    readers.splice(readers.indexOf(reader), 1);
    if (readers.length === 0) {
      detach();
    }
  }
};
