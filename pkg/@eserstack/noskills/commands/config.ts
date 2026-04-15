// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills config` — Manage noskills configuration (user identity, etc.).
 *
 * User identity is stored per-machine at ~/.config/noskills/user.json,
 * not in the project manifest (which is committed to git).
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import type * as shellArgs from "@eserstack/shell/args";
import * as identity from "../state/identity.ts";
import { cmdPrefix } from "../output/cmd.ts";

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const subcommand = args?.[0];

  if (subcommand === "set-user") return await setUser(args?.slice(1));
  if (subcommand === "get-user") return await getUser();
  if (subcommand === "clear-user") return await clearUser();

  const prefix = cmdPrefix();
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  out.writeln(`Usage: ${prefix} config <set-user | get-user | clear-user>`);
  await out.close();
  return results.ok(undefined);
};

const setUser = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  let name: string | null = null;
  let email: string | null = null;
  let fromGit = false;

  for (const arg of args ?? []) {
    if (arg.startsWith("--name=")) name = arg.slice("--name=".length);
    else if (arg.startsWith("--email=")) email = arg.slice("--email=".length);
    else if (arg === "--from-git") fromGit = true;
  }

  if (fromGit) {
    const gitUser = await identity.detectGitUser();
    if (gitUser === null) {
      out.writeln(span.red("Could not read git user config."));
      await out.close();
      return results.fail({ exitCode: 1 });
    }
    name = gitUser.name;
    email = gitUser.email;
  }

  if (name === null || name.length === 0) {
    out.writeln(
      span.red("Please provide a name: "),
      span.bold(
        `${cmdPrefix()} config set-user --name="Your Name" --email="you@example.com"`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const user: identity.NoskillsUser = { name, email: email ?? "" };
  await identity.setCurrentUser(user);

  out.writeln(
    span.green("User set: "),
    span.bold(identity.formatUser(user)),
  );
  out.writeln(
    span.dim(`  Stored in: ${identity.getUserFilePath()}`),
  );
  await out.close();
  return results.ok(undefined);
};

const getUser = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });
  const user = await identity.getCurrentUser();

  if (user === null) {
    out.writeln(span.dim("No user configured."));
    out.writeln(
      span.dim(
        `Set one with: ${cmdPrefix()} config set-user --name="Your Name"`,
      ),
    );
  } else {
    out.writeln(span.bold("User: "), identity.formatUser(user));
    out.writeln(span.dim(`  File: ${identity.getUserFilePath()}`));
  }

  await out.close();
  return results.ok(undefined);
};

const clearUser = async (): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  const removed = await identity.clearCurrentUser();
  if (removed) {
    out.writeln(span.green("User identity cleared."));
  } else {
    out.writeln(span.dim("No user configured."));
  }

  await out.close();
  return results.ok(undefined);
};
