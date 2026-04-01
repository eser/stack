// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Stateful ANSI escape sequence parser.
 * Handles partial sequences across data chunks.
 * @module
 */

export type ParsedSequence =
  | { type: "text"; text: string }
  | { type: "csi"; command: string; params: number[] }
  | { type: "osc"; command: number; data: string }
  | { type: "esc"; command: string }
  | { type: "control"; code: number };

// States: GROUND, ESC, CSI_PARAM, CSI_INTERMEDIATE, OSC
type ParserState = "GROUND" | "ESC" | "CSI_PARAM" | "OSC";

export class AnsiParser {
  #state: ParserState = "GROUND";
  #params = "";
  #oscData = "";
  #textBuf = "";

  feed(data: string): ParsedSequence[] {
    const results: ParsedSequence[] = [];

    const flushText = (): void => {
      if (this.#textBuf.length > 0) {
        results.push({ type: "text", text: this.#textBuf });
        this.#textBuf = "";
      }
    };

    for (let i = 0; i < data.length; i++) {
      const ch = data[i]!;
      const code = ch.charCodeAt(0);

      switch (this.#state) {
        case "GROUND":
          if (ch === "\x1b") {
            flushText();
            this.#state = "ESC";
          } else if (code < 0x20 && code !== 0x1b) {
            // Control character
            flushText();
            results.push({ type: "control", code });
          } else {
            this.#textBuf += ch;
          }
          break;

        case "ESC":
          if (ch === "[") {
            this.#state = "CSI_PARAM";
            this.#params = "";
          } else if (ch === "]") {
            this.#state = "OSC";
            this.#oscData = "";
          } else {
            // Simple escape: \x1b7, \x1b8, \x1bM, \x1bc, etc.
            results.push({ type: "esc", command: ch });
            this.#state = "GROUND";
          }
          break;

        case "CSI_PARAM":
          if ((code >= 0x30 && code <= 0x3f) || ch === ";" || ch === "?") {
            // Parameter bytes: 0-9, ;, ?
            this.#params += ch;
          } else if (code >= 0x40 && code <= 0x7e) {
            // Final byte — command letter
            const paramStr = this.#params.replace(/^\?/, "");
            const isPrivate = this.#params.startsWith("?");
            const params = paramStr.length > 0
              ? paramStr.split(";").map((s) => {
                const n = parseInt(s, 10);
                return isNaN(n) ? 0 : n;
              })
              : [];
            const command = (isPrivate ? "?" : "") + ch;
            results.push({ type: "csi", command, params });
            this.#state = "GROUND";
          } else {
            // Intermediate byte or unrecognized — skip
            this.#params += ch;
          }
          break;

        case "OSC":
          if (
            ch === "\x07" || (ch === "\\" && this.#oscData.endsWith("\x1b"))
          ) {
            // ST = BEL or ESC backslash
            const oscStr = ch === "\\"
              ? this.#oscData.slice(0, -1)
              : this.#oscData;
            const semi = oscStr.indexOf(";");
            const cmd = semi >= 0 ? parseInt(oscStr.slice(0, semi), 10) : 0;
            const oscPayload = semi >= 0 ? oscStr.slice(semi + 1) : oscStr;
            results.push({
              type: "osc",
              command: isNaN(cmd) ? 0 : cmd,
              data: oscPayload,
            });
            this.#state = "GROUND";
          } else {
            this.#oscData += ch;
          }
          break;
      }
    }

    flushText();
    return results;
  }
}
