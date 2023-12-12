// Copyright 2023-present the cool authors. All rights reserved. MIT license.

import * as runtime from "../standards/runtime.ts";

export const format = async (input: string) => {
  const proc = new runtime.Command(runtime.execPath(), {
    args: ["fmt", "-"],
    stdin: "piped",
    stdout: "piped",
    stderr: "null",
  }).spawn();

  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });
  await raw.pipeTo(proc.stdin);
  const { stdout } = await proc.output();

  const result = new TextDecoder().decode(stdout);

  return result;
};
