// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, assertEquals, assertFalse } from "@std/assert";

import { runtime } from "@eserstack/standards/cross-runtime";

import * as iteration from "./iteration.ts";

const PROGRESSES = ".eser/.state/progresses";

const makeProject = async (
  execution: Record<string, unknown>,
): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: "noskills-iteration-" });

  await Deno.mkdir(`${root}/${PROGRESSES}`, { recursive: true });
  await Deno.writeTextFile(
    `${root}/${PROGRESSES}/state.json`,
    JSON.stringify({ phase: "EXECUTING", execution }, null, 2),
  );

  return root;
};

const readState = async (root: string): Promise<Record<string, unknown>> =>
  JSON.parse(await Deno.readTextFile(`${root}/${PROGRESSES}/state.json`));

// The whole point of the driver flag: exactly one writer per turn. If this
// returns false while `noskills run` is driving, the in-agent Stop hook records
// the same turn the loop is about to record, and the two read-modify-writes on
// state.json lose one of the updates.
Deno.test("driver flag decides which writer owns the turn", () => {
  // A claim from THIS process: its pid is alive by construction.
  assert(
    iteration.isDriverAuthoritative({
      driver: "acp",
      driverPid: runtime.process.pid,
    }),
  );

  assertFalse(iteration.isDriverAuthoritative({}));
  assertFalse(iteration.isDriverAuthoritative(undefined));
  assertFalse(iteration.isDriverAuthoritative({ driver: "hook" }));
});

// A claim is released in a `finally`, which does not run when the loop is
// killed — Ctrl-C during a turn, a closed terminal, an OOM. If a claim outlived
// its owner it would silence the Stop hook for that project forever, converting
// one interrupted run into permanent breakage.
Deno.test("a claim whose owner died is not honoured", async () => {
  // A real pid that is guaranteed dead: spawn something trivial and wait for it.
  const dead = new Deno.Command("true", {
    stdout: "null",
    stderr: "null",
  }).spawn();
  const pid = dead.pid;

  await dead.status;

  assertFalse(
    iteration.isDriverAuthoritative({ driver: "acp", driverPid: pid }),
    "a claim from an exited process must not bind",
  );

  // A claim with no pid at all cannot be verified, so it must not bind either.
  assertFalse(iteration.isDriverAuthoritative({ driver: "acp" }));
});

Deno.test("setDriver claims and releases without disturbing the rest of state", async () => {
  const root = await makeProject({
    iteration: 4,
    lastProgress: "earlier work",
  });

  try {
    await iteration.setDriver(root, "acp");

    let execution = (await readState(root))["execution"] as Record<
      string,
      unknown
    >;

    assertEquals(execution["driver"], "acp");
    assertEquals(execution["driverPid"], runtime.process.pid);
    // Claiming must not clobber the fields the loop reads back next iteration.
    assertEquals(execution["iteration"], 4);
    assertEquals(execution["lastProgress"], "earlier work");

    await iteration.setDriver(root, null);

    execution = (await readState(root))["execution"] as Record<string, unknown>;

    // Released, not merely set to a falsy value: isDriverAuthoritative checks
    // for the literal "acp", but leaving a key behind would still show up in
    // state.json and read as though a loop were running.
    assertFalse("driver" in execution);
    assertFalse("driverPid" in execution);
    assertEquals(execution["iteration"], 4);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("recordIteration bumps the counter and captures tracked files", async () => {
  const root = await makeProject({ iteration: 2, lastProgress: "old" });

  await Deno.writeTextFile(
    `${root}/${PROGRESSES}/files-changed.jsonl`,
    ['{"file":"a.ts"}', '{"file":"b.ts"}', '{"file":"a.ts"}', "not json"].join(
      "\n",
    ),
  );

  try {
    const record = await iteration.recordIteration(root);

    assert(record !== null);
    assertEquals(record.iteration, 3);

    // Deduplicated, and the unparseable line is skipped rather than throwing —
    // a corrupt log line must not take down the turn that just succeeded.
    assertEquals([...record.modifiedFiles].sort(), ["a.ts", "b.ts"]);

    const execution = (await readState(root))["execution"] as Record<
      string,
      unknown
    >;

    assertEquals(execution["iteration"], 3);

    // The tracking log resets so the next iteration starts from empty; without
    // this every later iteration reports a growing union of all earlier files.
    const log = await Deno.readTextFile(
      `${root}/${PROGRESSES}/files-changed.jsonl`,
    );

    assertEquals(log, "");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// A turn that changed nothing must not erase the note explaining what the last
// productive turn did — the next prompt is built from it, so blanking it makes
// the agent lose its thread precisely when it is already stuck.
Deno.test("a no-op turn keeps the previous progress note", async () => {
  const root = await makeProject({
    iteration: 1,
    lastProgress: "added parser",
  });

  // A REAL git repo with a clean tree. Without one `git diff --stat` fails, the
  // stat falls back to the literal "no changes", and because that is a truthy
  // string it overwrites lastProgress -- so the no-op path would never be
  // exercised and this test would pass against a broken implementation.
  await new Deno.Command("git", { args: ["init", "-q"], cwd: root }).output();

  try {
    const record = await iteration.recordIteration(root);

    assert(record !== null);

    const execution = (await readState(root))["execution"] as Record<
      string,
      unknown
    >;

    assertEquals(execution["lastProgress"], "added parser");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

// The mirror of the test above, and the case that used to be wrong: when git
// cannot be consulted at all, the note describing the last productive turn must
// survive. It previously got overwritten with the literal "no changes" — the
// code reporting something it had not observed, and destroying real history on
// any machine without git or outside a work tree.
Deno.test("progress survives when git cannot be consulted", async () => {
  const root = await makeProject({
    iteration: 1,
    lastProgress: "added parser",
  });

  // No `git init` here: the temp dir is deliberately not a work tree.
  try {
    const record = await iteration.recordIteration(root);

    assert(record !== null);
    assertEquals(record.gitStat, "");

    const execution = (await readState(root))["execution"] as Record<
      string,
      unknown
    >;

    assertEquals(execution["lastProgress"], "added parser");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("recordIteration reports failure rather than throwing when state is absent", async () => {
  const root = await Deno.makeTempDir({ prefix: "noskills-iteration-" });

  try {
    assertEquals(await iteration.recordIteration(root), null);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
