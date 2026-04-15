// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * FileTokenStore — TokenStore backed by a single JSON file, keyed by platform.
 * Token file location: `$HOME/.eser/posts/tokens.json`
 *
 * File format:
 * {
 *   "twitter": { "accessToken": "...", "refreshToken": "...", "expiresAt": "...",
 *                "platformData": {} },
 *   "bluesky": { "accessToken": "...", "refreshToken": "...",
 *                "platformData": { "did": "did:plc:..." } }
 * }
 */

import type { OAuthTokens } from "../../domain/entities/user.ts";
import type { Platform } from "../../domain/values/platform.ts";
import type { TokenStore } from "../../application/token-store.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

const TOKEN_DIR = ".eser/posts";
const TOKEN_FILE = "tokens.json";

function resolveTokenPath(): string {
  const env = crossRuntime.runtime.env;
  const home = env.get("HOME") ?? env.get("USERPROFILE") ?? ".";
  return `${home}/${TOKEN_DIR}/${TOKEN_FILE}`;
}

/** Wire format — expiresAt stored as ISO 8601 string. */
interface PersistedEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  platformData?: Record<string, string>;
}

type PersistedStore = Partial<Record<Platform, PersistedEntry>>;

function deserialize(raw: PersistedEntry): OAuthTokens {
  return {
    accessToken: raw.accessToken,
    refreshToken: raw.refreshToken,
    expiresAt: raw.expiresAt !== undefined
      ? new Date(raw.expiresAt)
      : undefined,
    platformData: raw.platformData,
  };
}

function serialize(tokens: OAuthTokens): PersistedEntry {
  return {
    accessToken: tokens.accessToken,
    ...(tokens.refreshToken !== undefined &&
      { refreshToken: tokens.refreshToken }),
    ...(tokens.expiresAt !== undefined &&
      { expiresAt: tokens.expiresAt.toISOString() }),
    ...(tokens.platformData !== undefined &&
      { platformData: tokens.platformData }),
  };
}

async function readStore(tokenPath: string): Promise<PersistedStore> {
  const exists = await crossRuntime.runtime.fs.exists(tokenPath);
  if (!exists) return {};
  const text = await crossRuntime.runtime.fs.readTextFile(tokenPath);
  return JSON.parse(text) as PersistedStore;
}

async function writeStore(
  tokenPath: string,
  store: PersistedStore,
): Promise<void> {
  const dir = tokenPath.substring(0, tokenPath.lastIndexOf("/"));
  await crossRuntime.runtime.fs.ensureDir(dir);
  await crossRuntime.runtime.fs.writeTextFile(
    tokenPath,
    JSON.stringify(store, null, 2),
  );
}

/** Persists OAuth tokens per-platform to `$HOME/.eser/posts/tokens.json`. */
export class FileTokenStore implements TokenStore {
  private readonly tokenPath: string;

  constructor(tokenPath?: string) {
    this.tokenPath = tokenPath ?? resolveTokenPath();
  }

  async load(platform: Platform): Promise<OAuthTokens | null> {
    const store = await readStore(this.tokenPath);
    const entry = store[platform];
    return entry !== undefined ? deserialize(entry) : null;
  }

  async save(platform: Platform, tokens: OAuthTokens): Promise<void> {
    const store = await readStore(this.tokenPath);
    store[platform] = serialize(tokens);
    await writeStore(this.tokenPath, store);
  }

  async clear(platform: Platform): Promise<void> {
    const store = await readStore(this.tokenPath);
    if (store[platform] === undefined) return;
    delete store[platform];
    if (Object.keys(store).length === 0) {
      const exists = await crossRuntime.runtime.fs.exists(this.tokenPath);
      if (exists) await crossRuntime.runtime.fs.remove(this.tokenPath);
    } else {
      await writeStore(this.tokenPath, store);
    }
  }
}
