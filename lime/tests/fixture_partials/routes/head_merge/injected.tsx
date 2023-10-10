import { defineRoute } from "../../../../server.ts";

export default defineRoute(() => {
  return new Response("", {
    status: 302,
    headers: {
      Location: "/head_merge",
    },
  });
});
