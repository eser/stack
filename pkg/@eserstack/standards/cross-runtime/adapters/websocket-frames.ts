// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * WebSocket framing (RFC 6455, section 5) for the server end of a connection.
 *
 * The Node adapter runs WebSockets over the raw socket of an HTTP upgrade, so
 * it encodes the frames it sends and decodes the frames a client sends. The
 * functions here hold no connection state beyond the reader's buffers.
 *
 * @module
 */

/** The frame opcodes of RFC 6455, section 5.2. */
export const OPCODES = {
  continuation: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
} as const;

/** The close codes the server sends for its own reasons (RFC 6455, 7.4.1). */
export const CLOSE_CODES = {
  normal: 1000,
  goingAway: 1001,
  protocolError: 1002,
  noStatus: 1005,
  abnormal: 1006,
  invalidData: 1007,
  messageTooBig: 1009,
} as const;

/** One decoded frame; the payload is already unmasked. */
export type Frame = {
  readonly fin: boolean;
  readonly opcode: number;
  readonly payload: Uint8Array;
};

/** One complete message: text as a string, binary as bytes. */
export type Message = string | Uint8Array;

/** The status code and reason a close frame carries. */
export type CloseInfo = {
  readonly code: number;
  readonly reason: string;
};

/**
 * A client broke the protocol. The server closes the connection with `code`.
 */
export class WebSocketProtocolError extends Error {
  /** The close code to send: 1002, 1007 or 1009. */
  readonly code: number;

  /**
   * Creates the error.
   *
   * @param code - The close code to send
   * @param message - What the client sent and why it is refused
   * @param options - The underlying error, if any
   */
  constructor(code: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "WebSocketProtocolError";
    this.code = code;
  }
}

const encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_CONTROL_PAYLOAD_BYTES = 125;

/**
 * Encodes one unfragmented, unmasked frame, the form a server sends.
 *
 * @param opcode - One of {@link OPCODES}
 * @param payload - The frame payload
 * @returns The frame bytes
 */
export const encodeFrame = (
  opcode: number,
  payload: Uint8Array,
): Uint8Array => {
  const length = payload.byteLength;
  let headerLength = 10;
  if (length < 126) {
    headerLength = 2;
  } else if (length < 0x10000) {
    headerLength = 4;
  }

  const frame = new Uint8Array(headerLength + length);
  const view = new DataView(frame.buffer);
  frame[0] = 0x80 | opcode;

  if (headerLength === 2) {
    frame[1] = length;
  } else if (headerLength === 4) {
    frame[1] = 126;
    view.setUint16(2, length);
  } else {
    frame[1] = 127;
    view.setBigUint64(2, BigInt(length));
  }

  frame.set(payload, headerLength);

  return frame;
};

/**
 * Encodes a message as a text or binary frame.
 *
 * @param message - A string for a text frame, bytes for a binary frame
 * @returns The frame bytes
 */
export const encodeMessage = (message: Message): Uint8Array =>
  typeof message === "string"
    ? encodeFrame(OPCODES.text, encoder.encode(message))
    : encodeFrame(OPCODES.binary, message);

/**
 * Encodes a close frame.
 *
 * @param code - The status code, or null for a close frame without one
 * @param reason - The reason; sent only with a code
 * @returns The frame bytes
 */
export const encodeClose = (
  code: number | null,
  reason: string,
): Uint8Array => {
  if (code === null) {
    return encodeFrame(OPCODES.close, new Uint8Array(0));
  }

  const reasonBytes = encoder.encode(reason);
  const payload = new Uint8Array(2 + reasonBytes.byteLength);
  new DataView(payload.buffer).setUint16(0, code);
  payload.set(reasonBytes, 2);

  return encodeFrame(OPCODES.close, payload);
};

/**
 * Reads the status code and reason of a received close frame.
 *
 * @param payload - The close frame's payload
 * @returns The code (1005 for an empty payload) and the reason
 * @throws {WebSocketProtocolError} For a one-byte payload, a code a peer may
 * not send, or a reason that is not UTF-8
 */
export const decodeClose = (payload: Uint8Array): CloseInfo => {
  if (payload.byteLength === 0) {
    return { code: CLOSE_CODES.noStatus, reason: "" };
  }

  if (payload.byteLength === 1) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      "close frame payload is 1 byte; it must be empty or start with a 2-byte status code",
    );
  }

  const code = new DataView(payload.buffer, payload.byteOffset).getUint16(0);
  if (!isSendableCloseCode(code)) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      `close frame carries status code ${code}, which a peer may not send`,
    );
  }

  return { code, reason: decodeUtf8(payload.subarray(2)) };
};

/** The codes RFC 6455 (7.4) lets a peer put in a close frame. */
const isSendableCloseCode = (code: number): boolean =>
  (code >= 1000 && code <= 1003) ||
  (code >= 1007 && code <= 1011) ||
  (code >= 3000 && code <= 4999);

const decodeUtf8 = (bytes: Uint8Array): string => {
  try {
    return utf8Decoder.decode(bytes);
  } catch (error) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.invalidData,
      "text is not valid UTF-8",
      { cause: error },
    );
  }
};

/** Reads frames out of the byte chunks a socket delivers. */
export type FrameReader = {
  /**
   * Appends a chunk and returns the frames it completes, in order.
   *
   * @throws {WebSocketProtocolError} When the client breaks the protocol
   */
  readonly push: (chunk: Uint8Array) => readonly Frame[];
};

/**
 * Creates a reader for the frames a client sends.
 *
 * Client frames must be masked (RFC 6455, 5.1), and no extension is
 * negotiated, so the reserved bits must be zero.
 *
 * @param maxPayloadBytes - The largest frame payload accepted; a larger one is
 *   refused with close code 1009 before its bytes are buffered
 * @returns The reader
 */
export const createFrameReader = (maxPayloadBytes: number): FrameReader => {
  // The longest header: 2 bytes, an 8-byte length and a 4-byte mask.
  const header = new Uint8Array(14);
  let headerFilled = 0;
  let current: PendingFrame | null = null;

  return {
    push(chunk) {
      const frames: Frame[] = [];
      let offset = 0;

      while (offset < chunk.byteLength) {
        if (current === null) {
          // The header grows once its second byte gives the length form, so
          // it fills in steps until it has all the bytes it needs.
          const needed = headerLength(header, headerFilled);
          const take = Math.min(
            needed - headerFilled,
            chunk.byteLength - offset,
          );
          const before = headerFilled;
          header.set(chunk.subarray(offset, offset + take), headerFilled);
          headerFilled += take;
          offset += take;

          // The first two bytes decide whether the frame is acceptable at
          // all, so a bad frame is refused before the rest of it arrives.
          if (before < 2 && headerFilled >= 2) {
            checkFirstBytes(header);
          }

          if (headerFilled < headerLength(header, headerFilled)) {
            continue;
          }

          current = readHeader(header, maxPayloadBytes);
          headerFilled = 0;
        } else {
          const take = Math.min(
            current.payload.byteLength - current.filled,
            chunk.byteLength - offset,
          );
          current.payload.set(
            chunk.subarray(offset, offset + take),
            current.filled,
          );
          current.filled += take;
          offset += take;
        }

        if (current.filled === current.payload.byteLength) {
          frames.push(unmask(current));
          current = null;
        }
      }

      return frames;
    },
  };
};

/** A frame whose header is read and whose payload is still arriving. */
type PendingFrame = {
  readonly fin: boolean;
  readonly opcode: number;
  readonly mask: Uint8Array;
  readonly payload: Uint8Array;
  filled: number;
};

/** The header length that the first `filled` header bytes call for. */
const headerLength = (header: Uint8Array, filled: number): number => {
  if (filled < 2) {
    return 2;
  }

  const length7 =
    new DataView(header.buffer, header.byteOffset).getUint8(1) & 0x7f;
  if (length7 === 126) {
    return 2 + 2 + 4;
  }

  return length7 === 127 ? 2 + 8 + 4 : 2 + 4;
};

/**
 * Checks the first two bytes of a client frame header: the reserved bits, the
 * opcode, the mask bit and the shape of a control frame.
 */
const checkFirstBytes = (header: Uint8Array): void => {
  const view = new DataView(header.buffer, header.byteOffset);
  const first = view.getUint8(0);
  const second = view.getUint8(1);
  const opcode = first & 0x0f;

  if ((first & 0x70) !== 0) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      "frame sets a reserved bit, but no extension was negotiated",
    );
  }

  if (!KNOWN_OPCODES.has(opcode)) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      `frame has unknown opcode 0x${opcode.toString(16)}`,
    );
  }

  if ((second & 0x80) === 0) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      "client frame is not masked; RFC 6455 requires clients to mask every frame",
    );
  }

  const fin = (first & 0x80) !== 0;
  const length7 = second & 0x7f;
  if (
    opcode >= OPCODES.close &&
    (!fin || length7 > MAX_CONTROL_PAYLOAD_BYTES)
  ) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.protocolError,
      "control frame is fragmented or longer than 125 bytes",
    );
  }
};

/**
 * Reads a complete client frame header that checkFirstBytes accepted, and
 * allocates the frame's payload.
 */
const readHeader = (
  header: Uint8Array,
  maxPayloadBytes: number,
): PendingFrame => {
  const view = new DataView(header.buffer, header.byteOffset);
  const first = view.getUint8(0);
  const second = view.getUint8(1);
  const fin = (first & 0x80) !== 0;
  const opcode = first & 0x0f;

  const length7 = second & 0x7f;
  let length = length7;
  let maskOffset = 2;
  if (length7 === 126) {
    length = view.getUint16(2);
    maskOffset = 4;
  } else if (length7 === 127) {
    const length64 = view.getBigUint64(2);
    if (length64 > BigInt(maxPayloadBytes)) {
      throw new WebSocketProtocolError(
        CLOSE_CODES.messageTooBig,
        `frame payload is ${length64} bytes; the limit is ${maxPayloadBytes}`,
      );
    }
    length = Number(length64);
    maskOffset = 10;
  }

  if (length > maxPayloadBytes) {
    throw new WebSocketProtocolError(
      CLOSE_CODES.messageTooBig,
      `frame payload is ${length} bytes; the limit is ${maxPayloadBytes}`,
    );
  }

  return {
    fin,
    opcode,
    mask: header.slice(maskOffset, maskOffset + 4),
    payload: new Uint8Array(length),
    filled: 0,
  };
};

/** Unmasks a fully received frame's payload in place (RFC 6455, 5.3). */
const unmask = (frame: PendingFrame): Frame => {
  const { payload, mask } = frame;
  for (const [i, byte] of payload.entries()) {
    payload[i] = byte ^ mask[i % 4]!;
  }

  return { fin: frame.fin, opcode: frame.opcode, payload };
};

const KNOWN_OPCODES: ReadonlySet<number> = new Set(Object.values(OPCODES));

/** Joins the data frames of fragmented messages into messages. */
export type MessageAssembler = {
  /**
   * Takes a text, binary or continuation frame and returns the message it
   * completes, or null while the message is still fragmented.
   *
   * @throws {WebSocketProtocolError} For a continuation without a start, a new
   * message inside a fragmented one, an oversized message or invalid UTF-8
   */
  readonly push: (frame: Frame) => Message | null;
};

/**
 * Creates an assembler for the data frames of one connection.
 *
 * @param maxMessageBytes - The largest message accepted, summed over its
 *   fragments; a larger one is refused with close code 1009
 * @returns The assembler
 */
export const createMessageAssembler = (
  maxMessageBytes: number,
): MessageAssembler => {
  let opcode: number | null = null;
  let fragments: Uint8Array[] = [];
  let size = 0;

  const toMessage = (kind: number, payload: Uint8Array): Message =>
    kind === OPCODES.text ? decodeUtf8(payload) : payload;

  return {
    push(frame) {
      if (frame.opcode === OPCODES.continuation) {
        if (opcode === null) {
          throw new WebSocketProtocolError(
            CLOSE_CODES.protocolError,
            "continuation frame arrived with no fragmented message to continue",
          );
        }
      } else if (opcode !== null) {
        throw new WebSocketProtocolError(
          CLOSE_CODES.protocolError,
          "a new message started before the fragmented one finished",
        );
      } else if (frame.fin) {
        return toMessage(frame.opcode, frame.payload);
      } else {
        opcode = frame.opcode;
      }

      size += frame.payload.byteLength;
      if (size > maxMessageBytes) {
        throw new WebSocketProtocolError(
          CLOSE_CODES.messageTooBig,
          `message is over ${maxMessageBytes} bytes`,
        );
      }

      fragments.push(frame.payload);
      if (!frame.fin) {
        return null;
      }

      const payload = new Uint8Array(size);
      let offset = 0;
      for (const fragment of fragments) {
        payload.set(fragment, offset);
        offset += fragment.byteLength;
      }

      const kind = opcode;
      opcode = null;
      fragments = [];
      size = 0;

      return toMessage(kind, payload);
    },
  };
};
