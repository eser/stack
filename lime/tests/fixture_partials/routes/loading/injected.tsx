import { defineRoute } from "$cool/lime/server.ts";

export default defineRoute(() => {
  return new Response("", {
    status: 302,
    headers: {
      Location: "/loading",
    },
  });
});
