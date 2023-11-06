// Copyright 2023 the cool authors. All rights reserved. MIT license.

export const handler = {
  GET() {
    return new Response("Stay cool!", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  },
  NOTAMETHOD() {
    throw new Error("unreachable");
  },
};
