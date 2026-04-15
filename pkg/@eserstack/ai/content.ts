// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as types from "./types.ts";

// =============================================================================
// Message Constructors
// =============================================================================

export const textMessage = (
  role: types.Role,
  text: string,
): types.Message => {
  return {
    role,
    content: [{ kind: "text", text }],
  };
};

export const imageMessage = (
  role: types.Role,
  imageUrl: string,
  detail?: types.ImageDetail,
): types.Message => {
  return {
    role,
    content: [{ kind: "image", image: { url: imageUrl, detail } }],
  };
};

export const audioMessage = (
  role: types.Role,
  audioUrl: string,
  mimeType?: string,
): types.Message => {
  return {
    role,
    content: [{ kind: "audio", audio: { url: audioUrl, mimeType } }],
  };
};

export const toolResultMessage = (
  toolCallId: string,
  content: string,
  isError: boolean = false,
): types.Message => {
  return {
    role: "tool",
    content: [{
      kind: "tool_result",
      toolResult: { toolCallId, content, isError },
    }],
  };
};

// =============================================================================
// Content Block Constructors
// =============================================================================

export const textBlock = (text: string): types.TextBlock => {
  return { kind: "text", text };
};

export const toolCallBlock = (
  id: string,
  name: string,
  args: Record<string, unknown>,
): types.ToolCallBlock => {
  return { kind: "tool_call", toolCall: { id, name, arguments: args } };
};

export const toolResultBlock = (
  toolCallId: string,
  content: string,
  isError: boolean = false,
): types.ToolResultBlock => {
  return { kind: "tool_result", toolResult: { toolCallId, content, isError } };
};

// =============================================================================
// Data URL Utilities
// =============================================================================

const DATA_URL_PREFIX = "data:";
const BASE64_MARKER = ";base64,";

export const isDataUrl = (url: string): boolean => {
  return url.startsWith(DATA_URL_PREFIX);
};

export const decodeDataUrl = (
  dataUrl: string,
): { readonly mimeType: string; readonly data: Uint8Array } | null => {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    return null;
  }

  const rest = dataUrl.slice(DATA_URL_PREFIX.length);
  const base64Index = rest.indexOf(BASE64_MARKER);

  if (base64Index === -1) {
    return null;
  }

  const mimeType = rest.slice(0, base64Index);
  const base64Data = rest.slice(base64Index + BASE64_MARKER.length);

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return { mimeType, data: bytes };
};

// =============================================================================
// MIME Detection
// =============================================================================

const EXTENSION_MIME_MAP: Readonly<Record<string, string>> = {
  "png": "image/png",
  "jpg": "image/jpeg",
  "jpeg": "image/jpeg",
  "gif": "image/gif",
  "webp": "image/webp",
  "svg": "image/svg+xml",
  "bmp": "image/bmp",
  "mp3": "audio/mpeg",
  "wav": "audio/wav",
  "ogg": "audio/ogg",
  "flac": "audio/flac",
  "m4a": "audio/mp4",
  "webm": "audio/webm",
  "pdf": "application/pdf",
  "json": "application/json",
  "txt": "text/plain",
};

export const detectMimeFromUrl = (url: string): string | null => {
  const urlWithoutQuery = url.split("?")[0] ?? url;
  const lastDot = urlWithoutQuery.lastIndexOf(".");

  if (lastDot === -1) {
    return null;
  }

  const extension = urlWithoutQuery.slice(lastDot + 1).toLowerCase();

  return EXTENSION_MIME_MAP[extension] ?? null;
};
