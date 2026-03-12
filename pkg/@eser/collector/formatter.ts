// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// This file contains code from deno fresh (https://github.com/denoland/fresh),
// which is a web framework, licensed under the MIT license.

// Copyright (c) 2023 Eser Ozvataf and other contributors
// Copyright (c) 2021-2023 Luca Casonato

import { current } from "@eser/standards/runtime";
import * as shellExec from "@eser/shell/exec";

export const format = async (input: string) => {
  const execPath = current.process.execPath();
  const child = shellExec.exec`${execPath} fmt -`
    .stderr("null")
    .child();

  const raw = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    },
  });
  await raw.pipeTo(child.stdin!);
  const { stdout } = await child.output();

  const result = new TextDecoder().decode(stdout);

  return result;
};
