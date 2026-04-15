// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * output.ts — non-interactive stdout helpers for the CLI adapter.
 *
 * Wraps @eserstack/streams so all CLI commands share a consistent rendering style
 * without importing streams directly.
 */

import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type { Post } from "../../domain/entities/post.ts";

function makeOutput() {
  return streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
}

/** Print a single Post to stdout. */
export async function outputPost(post: Post): Promise<void> {
  const out = makeOutput();
  out.writeln(
    span.bold(`[${post.platform}]`),
    " ",
    span.dim(post.id),
  );
  out.writeln(post.text);
  out.writeln(span.dim(post.createdAt.toISOString()));
  await out.close();
}

/** Print an array of Posts to stdout, newest first. */
export async function outputPosts(posts: ReadonlyArray<Post>): Promise<void> {
  const out = makeOutput();
  for (const post of posts) {
    out.writeln(
      span.bold(`[${post.platform}]`),
      " ",
      span.dim(post.id),
    );
    out.writeln(post.text);
    out.writeln(span.dim(post.createdAt.toISOString()));
    out.writeln("");
  }
  await out.close();
}

/** Print a success message to stdout. */
export async function outputSuccess(message: string): Promise<void> {
  const out = makeOutput();
  out.writeln(span.green("✓"), " ", message);
  await out.close();
}

/** Print an error message to stdout. */
export async function outputError(message: string): Promise<void> {
  const out = makeOutput();
  out.writeln(span.red("✗"), " ", message);
  await out.close();
}
