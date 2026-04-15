// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * React Server Components Wire Protocol
 * Based on the RSC spec from React team
 */

// RSC Chunk Types
export const RSC_CHUNK_MODULE = "M"; // Module reference
export const RSC_CHUNK_JSON = "J"; // JSON data
export const RSC_CHUNK_ERROR = "E"; // Error
export const RSC_CHUNK_SUSPENSE = "P"; // Promise/Suspense boundary
export const RSC_CHUNK_SYMBOL = "S"; // Symbol reference

/**
 * Module reference format
 * M1:{"id":"./counter.tsx","chunks":["client"],"name":"default"}
 */
export type ModuleReference = {
  id: string;
  chunks: string[];
  name: string;
};

/**
 * Client reference marker - used by RSC to identify client components
 */
export type ClientReference = {
  $$typeof: symbol;
  $$id: string;
  $$async: boolean;
  name: string;
};

/**
 * Server reference marker - used by RSC to identify server actions
 * These are functions marked with "use server" directive
 */
export type ServerReference = {
  $$typeof: symbol;
  $$id: string;
  $$bound: unknown[] | null;
};

/**
 * Server action reference value in S chunks
 */
export type ServerActionReference = {
  id: string;
  bound: unknown[] | null;
};

/**
 * RSC Chunk - A unit of data in the RSC stream
 */
export type RSCChunk =
  | { type: "M"; id: number; value: ModuleReference }
  // deno-lint-ignore no-explicit-any
  | { type: "J"; id: number; value: any } // JSON value can be any serializable type
  | { type: "E"; id: number; value: { message: string; stack?: string } }
  | { type: "P"; id: number; value: number } // Promise ID
  | { type: "S"; id: number; value: string | ServerActionReference }; // Symbol or Server Action

/**
 * Serialize an RSC chunk to wire format
 */
export function serializeChunk(chunk: RSCChunk): string {
  const { type, id, value } = chunk;
  return `${type}${id}:${JSON.stringify(value)}\n`;
}

/**
 * Parse an RSC chunk from wire format
 */
export function parseChunk(line: string): RSCChunk | null {
  if (!line || line.length < 3) {
    return null;
  }

  const type = line[0] as RSCChunk["type"];
  const colonIndex = line.indexOf(":");

  if (colonIndex === -1) {
    return null;
  }

  const id = parseInt(line.slice(1, colonIndex), 10);
  const jsonStr = line.slice(colonIndex + 1);

  try {
    const value = JSON.parse(jsonStr);
    return { type, id, value } as RSCChunk;
  } catch {
    return null;
  }
}

/**
 * Check if a value is a client reference
 */
export function isClientReference(value: unknown): value is ClientReference {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as ClientReference).$$typeof ===
      Symbol.for("react.client.reference")
  );
}

/**
 * Check if a value is a server reference (server action)
 */
export function isServerReference(value: unknown): value is ServerReference {
  return (
    typeof value === "function" &&
    (value as unknown as ServerReference).$$typeof ===
      Symbol.for("react.server.reference")
  );
}

/**
 * Check if a value is a React element (handles both standard and transitional symbols)
 * React 19 RSC uses "react.transitional.element", React 18 uses "react.element"
 */
export function isReactElement(element: unknown): boolean {
  if (!element || typeof element !== "object") return false;
  const el = element as { $$typeof?: symbol };
  return (
    el.$$typeof === Symbol.for("react.transitional.element") ||
    el.$$typeof === Symbol.for("react.element")
  );
}

/**
 * Create a client reference marker
 */
export function createClientReference(
  moduleId: string,
  exportName: string,
): ClientReference {
  return {
    $$typeof: Symbol.for("react.client.reference"),
    $$id: moduleId,
    $$async: false,
    name: exportName,
  };
}
