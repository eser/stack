// Copyright 2023 the cool authors. All rights reserved. MIT license.

export const handler = {
  HEAD() {
    return new Response(null, {
      status: 204,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  },
  GET() {
    return new Response("Stay cool!", {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  },
};
